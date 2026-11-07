'use client';
import { useEffect, useState } from 'react';
import { HelpCircle, KeyRound, Link2, PlusCircle, Settings2, ShoppingBag, UserSearch, Wrench } from 'lucide-react';
import { PasteParser, SapFields, type SapForm } from './Sap';
import { ItFields } from './ItDetails';
import { CatalogPicker, CatalogQuestions, catalogReady, type Answers } from './Catalog';
import type { CatalogItem, ItDetails } from '@/lib/types';
import type { ExternalRefInput } from '@/lib/api';
import { createTicket, searchContacts } from '@/lib/api';
import type { ContactMatch } from '@/lib/types';
import { useSamadhan, type NewTicketPreset } from '@/lib/context';
import TicketFields, { type Values } from './TicketFields';
import { Button, Card, Field, Notice, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';
import { FileTray, uploadPending, usePendingFiles } from './Attachments';
import ApplicationPicker from './ApplicationPicker';
import { appById, availableApps, groupsFor, matrixPriority, refOf, statusesFor, usesImpactUrgency, workspaceById } from '@/lib/workspaces';

const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;
const EMPTY_TOP = { requesterName: '', requesterEmail: '', requesterPhone: '', subject: '', description: '', source: 'Phone', statusId: '2', groupId: '', agentId: '', priority: '', tags: '' };

// Top-of-form keys a preset can fill; everything else in a preset is a ticket field (TicketFields values).
const TOP_KEYS = Object.keys(EMPTY_TOP);

// v7 Phase 4 (§N 3): "What do you need?" - plain-language tiles that set the record class outside Secondary Sales.
const NEEDS = [
  { key: 'INCIDENT', label: 'Something is broken', hint: 'An error, a dump, a job or interface failing', icon: Wrench },
  { key: 'SERVICE_REQUEST', label: 'I need something', hint: 'A report, master data, a new device or setup', icon: ShoppingBag },
  { key: 'ACCESS_REQUEST', label: 'Access', hint: 'A role, a login, a password or unlock', icon: KeyRound },
  { key: 'CHANGE', label: 'A change', hint: 'Configuration, an enhancement, a transport', icon: Settings2 },
  { key: 'QUERY', label: 'A question', hint: 'How do I ... ?', icon: HelpCircle },
  { key: 'SAP_CASE', label: 'Track an SAP case', hint: 'An SAP for Me case or a vendor ticket', icon: Link2 },
] as const;

export default function NewTicket({ preset }: { preset?: NewTicketPreset }) {
  const { meta, openTicket, attachments, can, prefs, rememberApp } = useSamadhan();
  const withFiles = Boolean(attachments?.enabled) && can('attachment.upload');
  const tray = usePendingFiles(attachments?.limits.agent.perFileMb ?? 10, attachments?.limits.agent.filesPerAction ?? 10);
  const parentId = preset?.parentId;
  const [top, setTop] = useState({ ...EMPTY_TOP, ...Object.fromEntries(Object.entries(preset ?? {}).filter(([k, v]) => TOP_KEYS.includes(k) && typeof v === 'string')) });
  const [fields, setFields] = useState<Values>(Object.fromEntries(Object.entries(preset ?? {}).filter(([k, v]) => !TOP_KEYS.includes(k) && k !== 'parentId' && typeof v === 'string' && v)) as Values);
  const [another, setAnother] = useState(false);
  const [notify, setNotify] = useState(true);
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const set = (p: Partial<typeof EMPTY_TOP>) => setTop((t) => ({ ...t, ...p }));
  // v7 Phase 3: the application comes first and decides the desk. A child keeps its parent's unless changed;
  // otherwise the last one used, else Secondary Sales - General (today's behaviour).
  const apps = availableApps(meta);
  const initialApp = (): number | null => {
    if (parentId || !apps.length) return null;
    const fromPreset = Number(preset?.applicationId);
    if (apps.some((a) => a.id === fromPreset)) return fromPreset;
    const recent = (prefs.recentApps ?? []).find((id) => apps.some((a) => a.id === id));
    return recent ?? apps.find((a) => a.code === 'SS')?.id ?? apps[0].id;
  };
  const [applicationId, setApplicationId] = useState<number | null>(initialApp);
  const [impact, setImpact] = useState('');
  const [urgency, setUrgency] = useState('');
  const app = appById(meta, applicationId);
  const wsId = app?.workspaceId ?? null;
  const ws = workspaceById(meta, wsId);
  const matrix = usesImpactUrgency(meta, wsId);
  const fromMatrix = matrixPriority(meta, wsId, Number(impact) || null, Number(urgency) || null);
  const emailOk = EMAIL_RE.test(top.requesterEmail.trim());
  // v7 Phase 4: record class tiles, SAP details and an external case for the non-sales desks.
  const [need, setNeed] = useState('');
  const isSales = !ws || ws.key === 'SEC_SALES';
  const [sap, setSap] = useState<SapForm>({});
  const [extRef, setExtRef] = useState<ExternalRefInput>({});
  const [it, setIt] = useState<Partial<ItDetails>>({});
  const itDesk = ws?.key === 'DIGITAL_APPS' || ws?.key === 'INFRA_IT';
  const itFilled = Object.values(it).some((v) => v !== null && v !== undefined && v !== '');
  // v7 Phase 6: service-catalogue requests (the item presets the fields and starts its approval).
  const [catItem, setCatItem] = useState<CatalogItem | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [manager, setManager] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);
  const CATALOG_CLASS: Record<string, string[]> = { SERVICE_REQUEST: ['SERVICE_REQUEST'], ACCESS_REQUEST: ['ACCESS_REQUEST'], CHANGE: ['CHANGE'] };
  const deskItems = (meta.catalogItems ?? []).filter((i) => i.workspaceId === wsId && (isSales ? showCatalog : !!CATALOG_CLASS[need] && CATALOG_CLASS[need].includes(i.recordClass)));
  const pickItem = (i: CatalogItem | null) => { setCatItem(i); setAnswers({}); if (i && !top.subject.trim()) set({ subject: i.name }); };
  const sapDesk = ws?.key === 'SAP' || ws?.key === 'S4_PROGRAM';
  const sapFilled = Object.values(sap).some((v) => (Array.isArray(v) ? v.length : v !== null && v !== undefined && v !== ''));

  // Find the requester by name, email or phone (people who wrote in before), as the agent types.
  useEffect(() => {
    const q = lookup.trim();
    if (q.length < 2) { setMatches([]); return; }
    const id = setTimeout(() => { searchContacts(q).then(setMatches).catch(() => setMatches([])); }, 300);
    return () => clearTimeout(id);
  }, [lookup]);
  const pick = (c: ContactMatch) => {
    set({ requesterName: c.name, requesterEmail: c.email ?? '', requesterPhone: c.mobile || c.phone || '' });
    setMatches([]);
    setLookup('');
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        ...fields,
        requesterName: top.requesterName,
        requesterEmail: top.requesterEmail,
        requesterPhone: top.requesterPhone,
        subject: top.subject,
        description: top.description,
        source: top.source,
        statusId: Number(top.statusId),
        notifyRequester: notify,
        tags: top.tags.split(',').map((x) => x.trim()).filter(Boolean),
      };
      if (parentId) body.parentId = parentId;
      if (top.groupId) body.groupId = Number(top.groupId);
      if (top.agentId) body.agentId = Number(top.agentId);
      if (top.priority) body.priority = Number(top.priority);
      if (applicationId) body.applicationId = applicationId;
      if (matrix && impact) body.impact = Number(impact);
      if (matrix && urgency) body.urgency = Number(urgency);
      if (!isSales && need) body.recordClass = need === 'SAP_CASE' ? 'INCIDENT' : need;
      if (sapDesk && sapFilled) body.sap = sap;
      if (itDesk && itFilled) body.it = it;
      if (catItem && deskItems.some((i) => i.id === catItem.id)) { body.catalogItemId = catItem.id; body.catalogAnswers = answers; if (manager.trim()) body.managerEmail = manager.trim(); }
      if (!isSales && need === 'SAP_CASE' && extRef.ref?.trim()) body.externalRef = { system: extRef.system || meta.sapLists?.externalSystem[0], ...extRef };
      const t = await createTicket(body);
      if (applicationId) rememberApp(applicationId);
      // v7: files go up once the ticket exists; a failed file never loses the ticket.
      let fileErrors: string[] = [];
      if (withFiles && tray.ready.length) fileErrors = (await uploadPending(t.id, tray.ready)).errors;
      tray.clear();
      if (fileErrors.length) {
        setMsg({ tone: 'bad', text: `Ticket ${refOf(meta, t)} created, but some files were not added: ${fileErrors.join(' · ')}` });
        if (!another) setTimeout(() => openTicket(t.id), 2500);
        return;
      }
      if (another) {
        // Keep the requester and distributor details for the next call from the same person.
        setTop((x) => ({ ...EMPTY_TOP, requesterName: x.requesterName, requesterEmail: x.requesterEmail, requesterPhone: x.requesterPhone, source: x.source }));
        setSap({});
        setExtRef({});
        setIt({});
        setCatItem(null);
        setAnswers({});
        setMsg({ tone: 'good', text: `Ticket ${refOf(meta, t)} created. Log the next one below.` });
      } else {
        openTicket(t.id);
      }
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not create the ticket.' });
    } finally {
      setBusy(false);
    }
  };

  const sel = cx('h-9 w-full', inputBase);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{parentId ? `New child ticket of #${parentId}` : 'New ticket'}</h2>
        <p className="text-sm text-muted">Log a ticket on a requester&apos;s behalf (call, walk-in, message). Their email is needed: replies and updates go there. Email, portal and WhatsApp tickets arrive on their own.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {apps.length > 0 && (
            <Card title="Which app or area?" sub={ws && apps.some((a) => a.workspaceId !== apps[0].workspaceId) ? `Service desk: ${ws.name}` : 'Picks the application for reports, routing and the reference (e.g. MSFA-100123)'}>
              <ApplicationPicker value={applicationId} onChange={setApplicationId} allowInherit={Boolean(parentId)} />
            </Card>
          )}
          {!isSales && (
            <Card title="What do you need?" sub="Pick the closest - it sets the record class and the SLA">
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What do you need">
                {NEEDS.filter((n) => n.key !== 'SAP_CASE' || sapDesk).map((n) => (
                  <button key={n.key} type="button" role="radio" aria-checked={need === n.key} data-testid={`need-${n.key}`} onClick={() => setNeed(need === n.key ? '' : n.key)}
                    className={cx('flex items-start gap-2 rounded-xl border p-2.5 text-left transition', need === n.key ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-line hover:border-accent/50 hover:bg-sunken')}>
                    <n.icon size={16} className="mt-0.5 shrink-0 text-accent" />
                    <span><span className="block text-[13px] font-bold">{n.label}</span><span className="block text-2xs text-muted">{n.hint}</span></span>
                  </button>
                ))}
              </div>
              {need === 'SAP_CASE' && (
                <div className="mt-3 grid gap-3 sm:grid-cols-3" data-testid="new-external-ref">
                  <Field label="System"><select className={cx('h-9 w-full', inputBase)} value={extRef.system ?? ''} onChange={(e) => setExtRef({ ...extRef, system: e.target.value })}>{meta.sapLists?.externalSystem.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Case / ticket number"><input className={inputCls} value={extRef.ref ?? ''} onChange={(e) => setExtRef({ ...extRef, ref: e.target.value })} placeholder="e.g. 000123/2026" /></Field>
                  <Field label="Priority"><select className={cx('h-9 w-full', inputBase)} value={extRef.priority ?? ''} onChange={(e) => setExtRef({ ...extRef, priority: e.target.value })}><option value="">—</option>{meta.sapLists?.sapCasePriority.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  {extRef.priority === 'Very High' && <Field label="Justification" className="sm:col-span-3" hint="Very High outside Production needs a reason"><input className={inputCls} value={extRef.justification ?? ''} onChange={(e) => setExtRef({ ...extRef, justification: e.target.value })} /></Field>}
                </div>
              )}
            </Card>
          )}
          {isSales && (meta.catalogItems ?? []).some((i) => i.workspaceId === wsId) && !showCatalog && (
            <button type="button" className="text-2xs font-bold text-accent hover:underline" onClick={() => setShowCatalog(true)}>Request something from the catalogue (new app user, reinstall, data correction ...)</button>
          )}
          {deskItems.length > 0 && (
            <Card title="Pick a request" sub="Optional - a catalogue request fills in the details and sends it for approval when needed">
              <CatalogPicker items={deskItems} value={catItem?.id ?? null} onChange={pickItem} />
              {catItem && (
                <div className="mt-3 border-t border-line pt-3">
                  {catItem.approvalChainName && <p className="mb-2 text-2xs text-muted">Approval: <b>{catItem.approvalChainName}</b>{catItem.fulfilGroupName ? ` · fulfilled by ${catItem.fulfilGroupName}` : ''}</p>}
                  <CatalogQuestions item={catItem} answers={answers} onChange={setAnswers} manager={manager} onManager={setManager} />
                </div>
              )}
            </Card>
          )}
          <Card title="Requester and issue">
            <div className="relative mb-3">
              <UserSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className={cx(inputCls, 'pl-8')} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Find an existing requester by name, email or phone" aria-label="Find requester" />
              {matches.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-sunken">
                        <span className="font-semibold">{c.name}</span>
                        <span className="min-w-0 flex-1 truncate text-2xs text-muted">{[c.email, c.mobile || c.phone].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Requester name" required><input className={inputCls} value={top.requesterName} onChange={(e) => set({ requesterName: e.target.value })} /></Field>
              <Field label="Email" required hint={top.requesterEmail && !emailOk ? <span className="text-bad">Not a valid email</span> : undefined}>
                <input className={inputCls} type="email" value={top.requesterEmail} onChange={(e) => set({ requesterEmail: e.target.value })} />
              </Field>
              <Field label="Phone"><input className={inputCls} value={top.requesterPhone} onChange={(e) => set({ requesterPhone: e.target.value })} /></Field>
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Subject" required><input className={inputCls} value={top.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
              <Field label="Description"><textarea rows={5} className={textareaCls} value={top.description} onChange={(e) => set({ description: e.target.value })} onPaste={withFiles ? tray.onPaste : undefined} /></Field>
              {withFiles && <FileTray files={tray} maxFiles={attachments?.limits.agent.filesPerAction ?? 10} />}
            </div>
          </Card>
          {sapDesk && (
            <Card title="SAP details" sub="System, client and T-code help the right team pick it up first time" actions={<PasteParser onApply={(f) => { setSap((x) => ({ ...x, ...f })); if (!top.description.trim() && f.errorText) set({ description: f.errorText }); }} />}>
              <SapFields value={sap} onChange={setSap} />
            </Card>
          )}
          {itDesk && (
            <Card title={ws?.key === 'INFRA_IT' ? 'IT details' : 'App details'} sub={ws?.key === 'INFRA_IT' ? 'Server, asset tag and site get the engineer there faster' : 'Layer, URL, HTTP status and a correlation id help the developers find it in the logs'}>
              <ItFields value={it} onChange={setIt} deskKey={ws?.key} />
            </Card>
          )}
          <Card title="Ticket details" sub={isSales ? 'Category → Function sets severity and priority. Required fields (*) can be completed before resolving.' : 'Type and module route the ticket. Required fields (*) can be completed before resolving.'}>
            <TicketFields values={fields} onChange={(p) => setFields((f) => ({ ...f, ...p }))} workspaceKey={ws?.key} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Routing">
            <div className="space-y-3">
              <Field label="Source">
                <select className={sel} value={top.source} onChange={(e) => set({ source: e.target.value })}>
                  {meta.sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={sel} value={top.statusId} onChange={(e) => set({ statusId: e.target.value })}>
                  {statusesFor(meta, wsId).filter((s) => !s.isClosed).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Group" hint="Empty = routed by the automation rules">
                <select className={sel} value={top.groupId} onChange={(e) => set({ groupId: e.target.value })}>
                  <option value="">Automatic</option>
                  {groupsFor(meta, wsId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label="Agent" hint="Empty = round robin where the group uses it">
                <select className={sel} value={top.agentId} onChange={(e) => set({ agentId: e.target.value })}>
                  <option value="">Automatic</option>
                  {meta.agents.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              {matrix && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Impact">
                    <select className={sel} value={impact} onChange={(e) => setImpact(e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(meta.impacts ?? {}).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
                    </select>
                  </Field>
                  <Field label="Urgency">
                    <select className={sel} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                      <option value="">—</option>
                      {Object.entries(meta.urgencies ?? {}).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}
                    </select>
                  </Field>
                  {fromMatrix && <p className="col-span-2 text-2xs font-semibold text-accent" data-testid="matrix-priority">Priority from Impact × Urgency: {meta.priorities[fromMatrix]}</p>}
                </div>
              )}
              <Field label="Priority" hint={matrix ? 'Empty = from Impact × Urgency' : 'Empty = from the severity matrix'}>
                <select className={sel} value={top.priority} onChange={(e) => set({ priority: e.target.value })}>
                  <option value="">{matrix ? 'From Impact × Urgency' : 'From severity'}</option>
                  {Object.entries(meta.priorities).reverse().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Tags" hint="Comma separated"><input className={inputCls} value={top.tags} onChange={(e) => set({ tags: e.target.value })} /></Field>
            </div>
          </Card>
          {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Email the requester their ticket number
          </label>
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
            Create another after this one
          </label>
          <Button variant="primary" className="w-full" onClick={submit} disabled={busy || !top.subject.trim() || !top.requesterName.trim() || !emailOk || !catalogReady(catItem && deskItems.some((i) => i.id === catItem.id) ? catItem : null, answers, manager) || (apps.length > 0 && !applicationId && !parentId)}>
            {busy ? <Spinner /> : <PlusCircle size={14} />} Create ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
