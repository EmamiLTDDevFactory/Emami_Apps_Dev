'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { workspacesAdmin, type ApplicationInput, type MailClassification } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { Application, MatrixCell, PriorityMode, Workspace } from '@/lib/types';
import { wsTone } from '@/lib/workspaces';
import { Button, Card, Field, Modal, Notice, Pill, Skeleton, Spinner, Table, cx, inputBase, inputCls } from '../ui';

/*
   v7 Phase 3 Admin (master prompt §N 10): Workspaces (service desks + the multi-desk switch + Impact x Urgency matrix),
   Applications (the issue-area master; codes fixed once used), Mail classification (§J: settings, sender rules,
   keyword suggestions - never applied automatically).
*/

type Data = Awaited<ReturnType<typeof workspacesAdmin.get>>;
const MODES: { value: PriorityMode; label: string }[] = [
  { value: 'SEVERITY_MATRIX', label: 'Severity matrix (Category → Function)' },
  { value: 'IMPACT_URGENCY', label: 'Impact × Urgency' },
  { value: 'BOTH', label: 'Both (a matrix rule wins)' },
];
const sel = cx('h-9 w-full', inputBase);

function useAdminData() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await workspacesAdmin.get()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, setData, error, setError, load };
}

// ---------- Workspaces ----------
export function WorkspacesTab() {
  const { reloadMeta } = useSamadhan();
  const { data, setData, error, setError, load } = useAdminData();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [matrixFor, setMatrixFor] = useState<Workspace | null>(null);
  if (!data) return error ? <Notice>{error}</Notice> : <Skeleton />;
  const after = async () => { await load(); await reloadMeta(); };
  const toggleFlag = async () => {
    if (!data.enabled && !window.confirm('Switch on the service desks? Agents then see a desk switcher, and the SAP / Digital / Infra / Programme desks that are enabled below can receive tickets.')) return;
    // Shown at once; put back if the save fails.
    setData({ ...data, enabled: !data.enabled });
    setBusy(true);
    try { await workspacesAdmin.setFlag(!data.enabled); await after(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); await load(); } finally { setBusy(false); }
  };
  const toggleWs = async (w: Workspace) => {
    setData({ ...data, workspaces: data.workspaces.map((x) => (x.id === w.id ? { ...x, enabled: !w.enabled } : x)) });
    setBusy(true);
    try { await workspacesAdmin.saveWorkspace(w.id, { enabled: !w.enabled }); await after(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); await load(); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4" data-testid="admin-workspaces">
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <Card title="Service desks" sub="Secondary Sales is today's helpdesk and is always on. The other desks receive tickets only while this switch is on and the desk itself is enabled.">
        <label className="flex items-center gap-3 rounded-xl border border-line bg-sunken px-3 py-2">
          <input type="checkbox" checked={data.enabled} disabled={busy} onChange={toggleFlag} className="h-4 w-4 accent-[rgb(var(--accent))]" aria-label="Service desks on" />
          <span className="text-sm font-semibold">{data.enabled ? 'Service desks are ON' : 'Service desks are OFF - Samadhan works as before (Secondary Sales only)'}</span>
          {busy && <Spinner />}
        </label>
        <div className="mt-3">
          <Table head={['Desk', 'Code', 'Priority', 'Labels', 'Enabled', '']}>
            {data.workspaces.map((w) => (
              <tr key={w.id} className="border-t border-line">
                <td className="px-3 py-2"><span className={cx('rounded-md border px-1.5 py-0.5 text-2xs font-bold', wsTone(w))}>{w.name}</span><div className="mt-0.5 text-2xs text-muted">{w.description}</div></td>
                <td className="px-3 py-2 text-xs font-mono">{w.key}</td>
                <td className="px-3 py-2 text-xs">{MODES.find((m) => m.value === w.priorityMode)?.label}{w.priorityMode !== 'SEVERITY_MATRIX' && <button type="button" className="ml-1 text-accent underline" onClick={() => setMatrixFor(w)}>matrix</button>}</td>
                <td className="px-3 py-2 text-xs">{w.categoryLabel} → {w.functionLabel}</td>
                <td className="px-3 py-2">{w.key === 'SEC_SALES' ? <Pill tone="good">Always</Pill> : <input type="checkbox" checked={w.enabled} disabled={busy} onChange={() => toggleWs(w)} aria-label={`${w.name} enabled`} />}</td>
                <td className="px-3 py-2 text-right"><Button size="sm" onClick={() => setEditing(w)}>Edit</Button></td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>
      {editing && <WorkspaceDialog ws={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await after(); }} />}
      {matrixFor && <MatrixDialog ws={matrixFor} cells={data.matrix.filter((m) => m.workspaceId === matrixFor.id)} onClose={() => setMatrixFor(null)} onSaved={async () => { setMatrixFor(null); await after(); }} />}
    </div>
  );
}

function WorkspaceDialog({ ws, onClose, onSaved }: { ws: Workspace; onClose: () => void; onSaved: () => void }) {
  const { meta } = useSamadhan();
  const [f, setF] = useState({ name: ws.name, shortCode: ws.shortCode, description: ws.description ?? '', priorityMode: ws.priorityMode, categoryLabel: ws.categoryLabel, functionLabel: ws.functionLabel, defaultGroupId: ws.defaultGroupId ? String(ws.defaultGroupId) : '', portalEnabled: ws.portalEnabled });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await workspacesAdmin.saveWorkspace(ws.id, { ...f, defaultGroupId: f.defaultGroupId ? Number(f.defaultGroupId) : null });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${ws.name}`}>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Short code" hint="Shown in the switcher"><input className={inputCls} maxLength={8} value={f.shortCode} onChange={(e) => setF({ ...f, shortCode: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Priority from" className="sm:col-span-2"><select className={sel} value={f.priorityMode} onChange={(e) => setF({ ...f, priorityMode: e.target.value as PriorityMode })}>{MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        <Field label="Category label"><input className={inputCls} value={f.categoryLabel} onChange={(e) => setF({ ...f, categoryLabel: e.target.value })} /></Field>
        <Field label="Function label"><input className={inputCls} value={f.functionLabel} onChange={(e) => setF({ ...f, functionLabel: e.target.value })} /></Field>
        <Field label="Default group"><select className={sel} value={f.defaultGroupId} onChange={(e) => setF({ ...f, defaultGroupId: e.target.value })}><option value="">—</option>{meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.portalEnabled} onChange={(e) => setF({ ...f, portalEnabled: e.target.checked })} /> Visible on the portal</label>
        {error && <div className="sm:col-span-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.name.trim()} onClick={save}><Save size={14} /> Save</Button></div>
      </div>
    </Modal>
  );
}

function MatrixDialog({ ws, cells, onClose, onSaved }: { ws: Workspace; cells: MatrixCell[]; onClose: () => void; onSaved: () => void }) {
  const { meta } = useSamadhan();
  const [grid, setGrid] = useState<Record<string, number>>(() => Object.fromEntries(cells.map((c) => [`${c.impact}-${c.urgency}`, c.priority])));
  const [error, setError] = useState('');
  const save = async () => {
    const out = [];
    for (let i = 1; i <= 4; i++) for (let u = 1; u <= 4; u++) out.push({ impact: i, urgency: u, priority: grid[`${i}-${u}`] ?? 1 });
    try { await workspacesAdmin.saveMatrix(ws.id, out); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); }
  };
  return (
    <Modal open onClose={onClose} title={`Impact × Urgency - ${ws.name}`} width={720}>
      <div className="space-y-3 overflow-x-auto p-4">
        <table className="w-full text-xs">
          <thead><tr><th className="p-1 text-left">Impact ↓ / Urgency →</th>{[1, 2, 3, 4].map((u) => <th key={u} className="p-1 text-left font-semibold">{u} · {meta.urgencies?.[u]}</th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-t border-line">
                <td className="p-1 font-semibold">{i} · {meta.impacts?.[i]}</td>
                {[1, 2, 3, 4].map((u) => (
                  <td key={u} className="p-1">
                    <select aria-label={`Impact ${i} urgency ${u}`} className={cx('h-8 w-full', inputBase)} value={grid[`${i}-${u}`] ?? 1} onChange={(e) => setGrid({ ...grid, [`${i}-${u}`]: Number(e.target.value) })}>
                      {Object.entries(meta.priorities).reverse().map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}><Save size={14} /> Save matrix</Button></div>
      </div>
    </Modal>
  );
}

// ---------- Applications ----------
export function ApplicationsTab() {
  const { reloadMeta } = useSamadhan();
  const { data, error, setError, load } = useAdminData();
  const [editing, setEditing] = useState<Application | 'new' | null>(null);
  const [q, setQ] = useState('');
  if (!data) return error ? <Notice>{error}</Notice> : <Skeleton />;
  const ws = (id: number) => data.workspaces.find((w) => w.id === id);
  const term = q.trim().toLowerCase();
  const list = data.applications.filter((a) => !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || a.aliases.some((x) => x.includes(term)));
  return (
    <div className="space-y-4" data-testid="admin-applications">
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <Card title="Applications and issue areas" sub="Every ticket has one. The code gives the reference (MSFA-100123) and is fixed once a ticket uses it; names, keywords and owners can change any time."
        actions={<Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus size={13} /> New application</Button>}>
        <input className={cx(inputCls, 'mb-3 max-w-xs')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, name or keyword" aria-label="Search applications" />
        <Table head={['Code', 'Name', 'Desk', 'Keywords (mail classification)', 'Tickets', 'Active', '']}>
          {list.map((a) => (
            <tr key={a.id} className={cx('border-t border-line', !a.active && 'opacity-60')}>
              <td className="px-3 py-2 font-mono text-xs font-bold">{a.code}</td>
              <td className="px-3 py-2 text-xs font-semibold">{a.name}</td>
              <td className="px-3 py-2"><span className={cx('rounded-md border px-1.5 py-0.5 text-2xs font-bold', wsTone(ws(a.workspaceId)))}>{ws(a.workspaceId)?.shortCode}</span></td>
              <td className="max-w-xs px-3 py-2 text-2xs text-muted">{a.aliases.join(', ')}</td>
              <td className="num px-3 py-2 text-xs">{a.tickets ?? 0}</td>
              <td className="px-3 py-2 text-xs">{a.active ? 'Yes' : 'No'}</td>
              <td className="px-3 py-2 text-right"><Button size="sm" onClick={() => setEditing(a)}>Edit</Button></td>
            </tr>
          ))}
        </Table>
      </Card>
      {editing && <ApplicationDialog app={editing === 'new' ? null : editing} workspaces={data.workspaces} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); await reloadMeta(); }} />}
    </div>
  );
}

function ApplicationDialog({ app, workspaces, onClose, onSaved }: { app: Application | null; workspaces: Workspace[]; onClose: () => void; onSaved: () => void }) {
  const { meta } = useSamadhan();
  const [f, setF] = useState({
    code: app?.code ?? '', name: app?.name ?? '', workspaceId: String(app?.workspaceId ?? workspaces[0]?.id ?? ''), description: app?.description ?? '',
    aliases: (app?.aliases ?? []).join(', '), criticality: app?.criticality ?? '', businessOwner: app?.businessOwner ?? '',
    supportGroupId: app?.supportGroupId ? String(app.supportGroupId) : '', portalVisible: app?.portalVisible ?? true, active: app?.active ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = Boolean(app?.used);
  const save = async () => {
    setBusy(true);
    const body: ApplicationInput = {
      code: f.code.trim().toUpperCase(), name: f.name, workspaceId: Number(f.workspaceId), description: f.description, aliases: f.aliases,
      criticality: f.criticality || null, businessOwner: f.businessOwner || null, supportGroupId: f.supportGroupId ? Number(f.supportGroupId) : null,
      portalVisible: f.portalVisible, active: f.active,
    };
    try {
      if (app) await workspacesAdmin.saveApplication(app.id, body); else await workspacesAdmin.createApplication(body);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={app ? `Edit ${app.code}` : 'New application'} width={640}>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Code" required hint={locked ? 'Used on tickets - cannot change' : '2-8 capital letters / digits'}><input className={inputCls} value={f.code} disabled={locked} maxLength={8} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Service desk" hint={locked ? 'Has tickets - create a new application in the other desk instead' : undefined}>
          <select className={sel} value={f.workspaceId} disabled={locked} onChange={(e) => setF({ ...f, workspaceId: e.target.value })}>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Support group"><select className={sel} value={f.supportGroupId} onChange={(e) => setF({ ...f, supportGroupId: e.target.value })}><option value="">—</option>{meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Keywords" hint="Comma separated - mail classification looks for these" className="sm:col-span-2"><input className={inputCls} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Criticality"><select className={sel} value={f.criticality} onChange={(e) => setF({ ...f, criticality: e.target.value })}><option value="">—</option>{['High', 'Medium', 'Low'].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="Business owner"><input className={inputCls} value={f.businessOwner} onChange={(e) => setF({ ...f, businessOwner: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.portalVisible} onChange={(e) => setF({ ...f, portalVisible: e.target.checked })} /> Visible on the portal</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        {error && <div className="sm:col-span-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !f.code.trim() || !f.name.trim()} onClick={save}><Save size={14} /> Save</Button></div>
      </div>
    </Modal>
  );
}

// ---------- Mail classification ----------
export function MailClassificationTab() {
  const { meta } = useSamadhan();
  const [data, setData] = useState<MailClassification | null>(null);
  const [form, setForm] = useState({ ai: false, threshold: '0.8', defaultCode: 'SS', prefixInSubject: true });
  const [rule, setRule] = useState({ kind: 'domain' as 'domain' | 'email', pattern: '', applicationId: '' });
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await workspacesAdmin.mail();
      setData(d);
      setForm({ ai: d.settings.ai, threshold: String(d.settings.threshold), defaultCode: d.settings.defaultCode, prefixInSubject: d.prefixInSubject });
    } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not load.' }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return msg ? <Notice>{msg.text}</Notice> : <Skeleton />;
  const apps = meta.applications ?? [];
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); await load(); } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); }
  };
  const codes = apps.filter((a) => a.active && a.workspaceKey === 'SEC_SALES');
  return (
    <div className="space-y-4" data-testid="admin-mail-classification">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <Card title="How new mail is classified" sub="One mailbox for every desk. New tickets only - replies stay on their ticket. First match wins: subject tag → sender rule → keywords → AI → default.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default application" hint="When nothing matches (today's behaviour)"><select className={sel} value={form.defaultCode} onChange={(e) => setForm({ ...form, defaultCode: e.target.value })}>{codes.map((a) => <option key={a.code} value={a.code}>{a.code} – {a.name}</option>)}</select></Field>
          <Field label="AI confidence needed" hint="0.5 - 1"><input className={inputCls} type="number" min={0.5} max={1} step={0.05} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ai} disabled={!data.aiAvailable} onChange={(e) => setForm({ ...form, ai: e.target.checked })} /> Use AI when keywords do not decide {!data.aiAvailable && <span className="text-2xs text-muted">(no AI key on the server)</span>}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.prefixInSubject} onChange={(e) => setForm({ ...form, prefixInSubject: e.target.checked })} /> Show the reference (e.g. [MSFA-100123]) in email subjects</label>
        </div>
        <div className="mt-3 flex justify-end"><Button variant="primary" onClick={() => act(() => workspacesAdmin.saveMail({ ai: form.ai, threshold: Number(form.threshold), defaultCode: form.defaultCode, prefixInSubject: form.prefixInSubject }), 'Saved.')}><Save size={14} /> Save</Button></div>
        <p className="mt-3 rounded-lg bg-sunken p-2 text-2xs text-muted">Tip for users: start the subject with the application code for faster routing, e.g. <b>[MSFA] beat not syncing</b>, <b>DMS: invoice stuck</b>{apps.some((a) => a.code === 'SAP' && a.available) ? <>, <b>[SAP] user locked</b></> : null}.</p>
      </Card>
      <Card title="Sender rules" sub="Mail from this address or domain goes to the application (unless the subject has a tag).">
        <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => workspacesAdmin.addRule({ kind: rule.kind, pattern: rule.pattern, applicationId: Number(rule.applicationId) }), 'Rule added.').then(() => setRule({ ...rule, pattern: '' })); }}>
          <select aria-label="Rule kind" className={cx('h-9', inputBase)} value={rule.kind} onChange={(e) => setRule({ ...rule, kind: e.target.value as 'domain' | 'email' })}><option value="domain">Domain</option><option value="email">Email address</option></select>
          <input aria-label="Sender" className={cx(inputCls, 'max-w-xs')} value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder={rule.kind === 'domain' ? 'vendor.com' : 'person@vendor.com'} />
          <select aria-label="Application" className={cx('h-9 max-w-xs', inputBase)} value={rule.applicationId} onChange={(e) => setRule({ ...rule, applicationId: e.target.value })}><option value="">Application…</option>{apps.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select>
          <Button type="submit" disabled={!rule.pattern.trim() || !rule.applicationId}><Plus size={13} /> Add rule</Button>
        </form>
        {data.rules.length === 0 ? <p className="text-2xs text-muted">No sender rules yet.</p> : (
          <Table head={['Sender', 'Application', 'Added by', '']}>
            {data.rules.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 text-xs">{r.kind === 'domain' ? '@' : ''}{r.pattern}</td>
                <td className="px-3 py-2 text-xs font-semibold">{r.code} – {r.applicationName}</td>
                <td className="px-3 py-2 text-2xs text-muted">{r.createdBy}</td>
                <td className="px-3 py-2 text-right"><button type="button" aria-label={`Delete rule ${r.pattern}`} className="text-muted hover:text-bad" onClick={() => window.confirm(`Delete the rule for ${r.pattern}?`) && act(() => workspacesAdmin.deleteRule(r.id), 'Rule deleted.')}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Suggested keywords" sub="Words that keep appearing in tickets agents moved to an application. Add them as keywords if they fit - nothing is added automatically.">
        {data.suggestions.length === 0 ? <p className="text-2xs text-muted">No suggestions yet - they appear after agents correct a few classifications.</p> : (
          <div className="flex flex-wrap gap-2">
            {data.suggestions.map((s) => (
              <button key={`${s.applicationId}-${s.keyword}`} type="button" onClick={() => act(() => workspacesAdmin.addAlias(s.applicationId, s.keyword), `"${s.keyword}" added to ${s.code}.`)} className="rounded-lg border border-line px-2 py-1 text-2xs hover:border-accent" title="Add as keyword">
                <b>{s.keyword}</b> → {s.code} <span className="text-muted">({s.hits}×)</span> <Plus size={11} className="inline" />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
