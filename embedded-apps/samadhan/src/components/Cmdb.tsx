'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, Boxes, Download, Link2, Pencil, Plus, Repeat, Save, Search, ShieldCheck, Trash2, Upload, Wrench } from 'lucide-react';
import { cmdbApi } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, relative } from '@/lib/format';
import type { CiDetail, CiRef, CmdbList, ConfigItem } from '@/lib/types';
import { Button, Card, Drawer, Empty, Field, Kpi, Notice, Pill, Skeleton, Spinner, Table, cx, inputBase, inputCls, textareaCls } from './ui';
import { ItsmTag } from './Itsm';

/*
   Configuration (CMDB) - ITIL service configuration management + IT asset management:
     identification (code / asset tag, class, owner), control (every change in the history), status accounting
     (Planned -> In stock -> In use -> In repair -> Retired -> Disposed), relationships, verification and audit, and the
     tickets on each item (repeat incidents on one item point to a problem). Excel template / import for the asset register.
*/
const sel = cx('h-9 w-full', inputBase);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral' | 'accent'> = { 'In use': 'good', 'In stock': 'accent', Planned: 'neutral', 'In repair': 'warn', Retired: 'neutral', Disposed: 'bad' };
type Flag = '' | 'unverified' | 'warranty' | 'repeat';
const COL_LABEL: Record<string, string> = {
  code: 'Code / asset tag *', name: 'Name *', ciClass: 'Class', status: 'Status', criticality: 'Criticality', siteLocation: 'Site', department: 'Department',
  assignedName: 'User', assignedEmail: 'User email', manufacturer: 'Manufacturer', model: 'Model', serialNo: 'Serial no', ipAddress: 'IP / host', version: 'Version',
  purchaseDate: 'Purchase date (YYYY-MM-DD)', warrantyEnd: 'Warranty end (YYYY-MM-DD)', environment: 'Environment', notes: 'Notes',
};

export default function Cmdb() {
  const { can } = useSamadhan();
  const [data, setData] = useState<CmdbList | null>(null);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [status, setStatus] = useState('');
  const [flag, setFlag] = useState<Flag>('');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [error, setError] = useState('');
  const manage = can('cmdb.manage');
  const load = useCallback(() => {
    cmdbApi.list({ q, ciClass: cls, status, flag }).then(setData).catch((e) => setError(errText(e)));
  }, [q, cls, status, flag]);
  useEffect(() => { const h = setTimeout(load, q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);
  if (!data) return error ? <Notice>{error}</Notice> : <Card><Skeleton /></Card>;
  if (!data.ready) return <Empty title="The CMDB is not set up on this server yet" icon={Boxes}>It appears after the next backend update (migration 7.12).</Empty>;
  const s = data.summary;
  return (
    <div className="space-y-4" data-testid="cmdb">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight">Configuration (CMDB) <ItsmTag practice={['config', 'asset']} /></h2>
          <p className="text-sm text-muted">Every laptop, desktop, printer, network device, server, cloud service and application that IT supports - who has it, where it is, its state and what it depends on.</p>
        </div>
        {manage && <Button variant="primary" onClick={() => setOpen('new')}><Plus size={14} /> Add item</Button>}
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {s && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi label="Configuration items" value={s.total} sub={`${s.inUse} in use`} icon={Boxes} onClick={() => setFlag('')} />
          <Kpi label="In repair" value={s.inRepair} icon={Wrench} tone={s.inRepair ? 'warn' : 'good'} onClick={() => { setFlag(''); setStatus('In repair'); }} />
          <Kpi label={`Not verified ${data.verifyDays} days`} value={s.unverified} sub="audit due" icon={ShieldCheck} tone={s.unverified ? 'warn' : 'good'} onClick={() => setFlag('unverified')} />
          <Kpi label="Warranty ending" value={s.warrantyEnding} sub="within 60 days" icon={AlertTriangle} tone={s.warrantyEnding ? 'warn' : 'good'} onClick={() => setFlag('warranty')} />
          <Kpi label="Repeat incidents" value={s.repeat} sub="3+ tickets in 30 days" icon={Repeat} tone={s.repeat ? 'bad' : 'good'} onClick={() => setFlag('repeat')} />
        </div>
      )}
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
          <Field label="Search" className="min-w-[200px] flex-1"><div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-faint" /><input className={cx(inputCls, 'pl-8')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Asset tag, name, user, serial, IP" /></div></Field>
          <Field label="Class"><select className={cx(sel, 'w-48')} value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{data.lists.classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Status"><select className={cx(sel, 'w-36')} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{data.lists.statuses.map((c) => <option key={c}>{c}</option>)}</select></Field>
          {flag && <Button size="sm" onClick={() => setFlag('')}>Clear: {flag === 'unverified' ? 'not verified' : flag === 'warranty' ? 'warranty ending' : 'repeat incidents'}</Button>}
        </div>
        {data.items.length === 0 ? <div className="p-4"><Empty title="Nothing matches" /></div> : (
          <Table head={['Code', 'Name', 'Class', 'Status', 'User / owner', 'Site', 'Vendor / hosting', 'Tickets (30 d)', 'Verified']}>
            {data.items.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken" onClick={() => setOpen(c.id)}>
                <td className="num whitespace-nowrap px-3 py-2 font-semibold text-accent">{c.code}</td>
                <td className="px-3 py-2">{c.name}{c.criticality === 'Critical' && <> <Pill tone="bad">Critical</Pill></>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-2xs">{c.ciClass}</td>
                <td className="px-3 py-2"><Pill tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Pill></td>
                <td className="px-3 py-2 text-2xs">{c.assignedName ?? c.ownerGroupName ?? '—'}</td>
                <td className="px-3 py-2 text-2xs">{c.siteLocation ?? '—'}</td>
                <td className="px-3 py-2 text-2xs">{[c.supportPartnerName, c.hostingPartnerName].filter(Boolean).join(' · ') || '—'}</td>
                <td className="num px-3 py-2">{c.tickets30d ? <Pill tone={(c.tickets30d ?? 0) >= 3 ? 'bad' : 'neutral'}>{c.tickets30d}{c.openTickets ? ` · ${c.openTickets} open` : ''}</Pill> : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-2xs">{c.lastVerifiedAt ? relative(c.lastVerifiedAt) : <span className="text-warn">never</span>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {manage && <ImportCard columns={data.importColumns} onDone={load} />}
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open === 'new' ? 'Add configuration item' : 'Configuration item'} width={720}>
        {open !== null && <CiDrawer id={open} lists={data.lists} manage={manage} onSaved={(id) => { load(); setOpen(id); }} />}
      </Drawer>
    </div>
  );
}

function CiDrawer({ id, lists, manage, onSaved }: { id: number | 'new'; lists: CmdbList['lists']; manage: boolean; onSaved: (id: number) => void }) {
  const { meta, openTicket } = useSamadhan();
  const [d, setD] = useState<CiDetail | null>(null);
  const [form, setForm] = useState<Partial<ConfigItem> | null>(id === 'new' ? { status: 'In use', criticality: 'Medium', ciClass: 'Laptop' } : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [rel, setRel] = useState({ q: '', kind: lists.relations[0], hits: [] as CiRef[] });
  const load = useCallback(() => { if (id !== 'new') cmdbApi.get(id).then(setD).catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (rel.q.trim().length < 2) return;
    const h = setTimeout(() => { cmdbApi.search(rel.q).then((hits) => setRel((r) => ({ ...r, hits }))).catch(() => {}); }, 250);
    return () => clearTimeout(h);
  }, [rel.q]);
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try { const r = await cmdbApi.save({ ...form, ...(id !== 'new' ? { id } : {}) }); setForm(null); setMsg({ tone: 'good', text: 'Saved.' }); onSaved(r.id); if (id !== 'new') load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); try { await fn(); setMsg({ tone: 'good', text: ok }); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const it = meta.itsm;
  const ci = d?.ci;
  if (id !== 'new' && !d) return msg ? <Notice>{msg.text}</Notice> : <Skeleton />;
  if (form) {
    const f = form;
    const set = (p: Partial<ConfigItem>) => setForm({ ...f, ...p });
    const txt = (k: keyof ConfigItem, label: string, type = 'text') => <Field label={label}><input type={type} className={inputCls} value={(f[k] as string | null) ?? ''} onChange={(e) => set({ [k]: e.target.value } as Partial<ConfigItem>)} /></Field>;
    return (
      <div className="space-y-3" data-testid="ci-form">
        <p className="text-2xs text-muted"><ItsmTag practice="config" /> Identification: a unique code (the asset tag on the sticker, e.g. IND-KOL-L-0042, or a CI id), the class and who owns or uses it.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {txt('code', 'Code / asset tag *')}
          {txt('name', 'Name *')}
          <Field label="Class"><select className={sel} value={f.ciClass ?? ''} onChange={(e) => set({ ciClass: e.target.value })}>{lists.classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Status (lifecycle)"><select className={sel} value={f.status ?? ''} onChange={(e) => set({ status: e.target.value })}>{lists.statuses.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Criticality"><select className={sel} value={f.criticality ?? ''} onChange={(e) => set({ criticality: e.target.value })}>{lists.criticality.map((c) => <option key={c}>{c}</option>)}</select></Field>
          {txt('environment', 'Environment')}
          {txt('assignedName', 'User (allocated to)')}
          {txt('assignedEmail', 'User email', 'email')}
          {txt('department', 'Department')}
          {txt('siteLocation', 'Site / location')}
          <Field label="Owner group"><select className={sel} value={f.ownerGroupId ?? ''} onChange={(e) => set({ ownerGroupId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Support vendor"><select className={sel} value={f.supportPartnerId ?? ''} onChange={(e) => set({ supportPartnerId: e.target.value ? Number(e.target.value) : null })}><option value="">In-house</option>{(it?.vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Hosting / hyperscaler"><select className={sel} value={f.hostingPartnerId ?? ''} onChange={(e) => set({ hostingPartnerId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{(it?.hyperscalers ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Application"><select className={sel} value={f.applicationId ?? ''} onChange={(e) => set({ applicationId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{(meta.applications ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select></Field>
          {txt('manufacturer', 'Manufacturer')}
          {txt('model', 'Model')}
          {txt('serialNo', 'Serial no')}
          {txt('ipAddress', 'IP / host')}
          {txt('version', 'Version')}
          {txt('purchaseDate', 'Purchase date', 'date')}
          {txt('warrantyEnd', 'Warranty end', 'date')}
        </div>
        <Field label="Notes"><textarea rows={2} className={textareaCls} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        <div className="flex gap-2"><Button variant="primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Save size={14} />} Save</Button>{id !== 'new' && <Button onClick={() => setForm(null)}>Cancel</Button>}</div>
      </div>
    );
  }
  if (!d || !ci) return null;
  const facts: [string, string | null | undefined][] = [
    ['Class', ci.ciClass], ['Criticality', ci.criticality], ['User', [ci.assignedName, ci.assignedEmail].filter(Boolean).join(' · ')], ['Department', ci.department],
    ['Site', ci.siteLocation], ['Owner group', ci.ownerGroupName], ['Support vendor', ci.supportPartnerName ?? 'In-house'], ['Hosting', ci.hostingPartnerName],
    ['Application', ci.applicationCode], ['Environment', ci.environment], ['Make / model', [ci.manufacturer, ci.model].filter(Boolean).join(' ')], ['Serial no', ci.serialNo],
    ['IP / host', ci.ipAddress], ['Version', ci.version], ['Purchased', ci.purchaseDate], ['Warranty end', ci.warrantyEnd],
  ];
  return (
    <div className="space-y-4" data-testid="ci-detail">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="num text-2xs font-bold text-muted">{ci.code}</div><h3 className="text-lg font-extrabold">{ci.name}</h3><div className="mt-1 flex flex-wrap gap-1.5"><Pill tone={STATUS_TONE[ci.status] ?? 'neutral'}>{ci.status}</Pill><ItsmTag practice={['config', 'asset']} /></div></div>
        {manage && <div className="flex gap-2">
          <Button size="sm" onClick={() => setForm({ ...ci })}><Pencil size={13} /> Edit</Button>
          <Button size="sm" onClick={() => act(() => cmdbApi.verify(ci.id), 'Verified today.')} title="Verification and audit: you checked it is where the CMDB says, with this user"><BadgeCheck size={13} /> Verified</Button>
        </div>}
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <dl className="grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
        <div className="flex justify-between gap-3 border-b border-line/60 py-1"><dt className="text-muted">Last verified</dt><dd className="text-right font-semibold">{ci.lastVerifiedAt ? `${fmtDateTime(ci.lastVerifiedAt)}${ci.lastVerifiedBy ? ` · ${ci.lastVerifiedBy}` : ''}` : <span className="text-warn">never</span>}</dd></div>
      </dl>
      {ci.notes && <p className="whitespace-pre-wrap rounded-lg bg-sunken p-2 text-2xs">{ci.notes}</p>}
      <section>
        <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Relationships</h4>
        {d.relations.length === 0 ? <p className="text-2xs text-muted">None yet - e.g. a laptop &quot;Connected to&quot; a switch, an application &quot;Runs on&quot; a server.</p> : (
          <ul className="space-y-1">{d.relations.map((r) => (
            <li key={`${r.id}-${r.dir}`} className="flex items-center gap-2 rounded-lg bg-sunken px-2 py-1 text-2xs">
              <span className="text-muted">{r.dir === 'out' ? r.kind : `${r.kind} (from)`}</span><span className="num font-semibold">{r.code}</span><span className="min-w-0 flex-1 truncate">{r.name}</span>
              {manage && <button type="button" aria-label="Remove relationship" className="text-faint hover:text-bad" onClick={() => act(() => cmdbApi.unrelate(ci.id, r.id), 'Removed.')}><Trash2 size={12} /></button>}
            </li>
          ))}</ul>
        )}
        {manage && (
          <div className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr]">
            <select className={sel} value={rel.kind} onChange={(e) => setRel({ ...rel, kind: e.target.value })} aria-label="Relationship">{lists.relations.map((k) => <option key={k}>{k}</option>)}</select>
            <input className={inputCls} value={rel.q} onChange={(e) => setRel({ ...rel, q: e.target.value, hits: e.target.value.length < 2 ? [] : rel.hits })} placeholder="Find the other item" aria-label="Find the related item" />
            {rel.hits.filter((h) => h.id !== ci.id).length > 0 && (
              <ul className="space-y-1 sm:col-span-2">{rel.hits.filter((h) => h.id !== ci.id).map((h) => (
                <li key={h.id} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-2xs"><span className="num font-semibold">{h.code}</span><span className="min-w-0 flex-1 truncate">{h.name}</span>
                  <Button size="sm" onClick={() => act(async () => { await cmdbApi.relate(ci.id, h.id, rel.kind); setRel({ ...rel, q: '', hits: [] }); }, 'Relationship added.')}><Link2 size={12} /> Add</Button></li>
              ))}</ul>
            )}
          </div>
        )}
      </section>
      <section>
        <h4 className="mb-1 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Tickets on this item <ItsmTag practice={['incident', 'problem']} /></h4>
        {d.tickets.length === 0 ? <p className="text-2xs text-muted">No tickets linked.</p> : (
          <ul className="space-y-1">{d.tickets.map((t) => (
            <li key={t.id}><button type="button" onClick={() => openTicket(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-2xs hover:bg-sunken">
              <span className="num font-semibold text-accent">{t.applicationCode ? `${t.applicationCode}-${t.id}` : `#${t.id}`}</span><span className="min-w-0 flex-1 truncate">{t.subject}</span><Pill tone={t.isResolved ? 'good' : 'warn'}>{t.statusName}</Pill>
            </button></li>
          ))}</ul>
        )}
        {d.tickets.filter((t) => Date.now() - new Date(t.createdAt).getTime() < 30 * 86400000).length >= 3 && <Notice tone="warn">3 or more tickets in 30 days on this item - consider a problem record (root cause).</Notice>}
      </section>
      <section>
        <h4 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">History (status accounting &amp; audit)</h4>
        <ul className="max-h-64 space-y-1 overflow-y-auto">{d.history.map((h) => (
          <li key={h.id} className="rounded-lg bg-sunken px-2 py-1 text-2xs">
            <span className="font-semibold">{h.action.replace(/_/g, ' ')}</span> <span className="text-muted">· {h.byName ?? 'system'} · {fmtDateTime(h.createdAt)}</span>
            {Object.keys(h.details).length > 0 && <div className="text-muted">{Object.entries(h.details).map(([k, v]) => (v && typeof v === 'object' && 'to' in (v as object) ? `${k}: ${String((v as { from: unknown }).from ?? '—')} → ${String((v as { to: unknown }).to ?? '—')}` : `${k}: ${String(v)}`)).join(' · ')}</div>}
          </li>
        ))}</ul>
      </section>
    </div>
  );
}

function ImportCard({ columns, onDone }: { columns: string[]; onDone: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof cmdbApi.importRows>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns.map((c) => COL_LABEL[c] ?? c)]), 'CMDB');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns.map((c) => COL_LABEL[c] ?? c), ['IND-KOL-L-0042', 'Dell Latitude 5440', 'Laptop', 'In use', 'Medium', 'Kolkata HO', 'Finance', 'Ravi Kumar', 'ravi.kumar@emamigroup.com', 'Dell', 'Latitude 5440', 'SN12345', '', '', '2025-04-01', '2028-03-31', '', '']]), 'Example');
    XLSX.writeFile(wb, 'Samadhan-CMDB-template.xlsx');
  };
  const read = async (f: File) => {
    setError(''); setRes(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
      const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/\(.*?\)|\*/g, '').replace(/[^a-z0-9]/g, '');
      const head = (raw[0] ?? []).map(norm);
      const keyOf = (h: string) => columns.find((c) => norm(COL_LABEL[c] ?? c) === h || norm(c) === h);
      const keys = head.map(keyOf);
      const out = raw.slice(1).filter((r) => r.some((x) => String(x ?? '').trim())).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : String(r[i] ?? '').trim()]).filter(([k]) => k)) as Record<string, string>);
      setRows(out);
      setBusy(true);
      setRes(await cmdbApi.importRows(out, true));
    } catch (e) { setError(errText(e)); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  return (
    <Card title={<span className="inline-flex flex-wrap items-center gap-1.5"><Upload size={15} className="text-accent" /> Asset register import <ItsmTag practice="asset" /></span>} sub="Bring the asset register or a discovery export in from Excel. New codes are added, known codes updated; checked first, saved only on Import.">
      <div className="space-y-2 text-[13px]">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={template}><Download size={14} /> Download template</Button>
          <Button onClick={() => file.current?.click()} disabled={busy}>{busy ? <Spinner /> : <Upload size={14} />} Upload &amp; check</Button>
          {res?.dryRun && rows && res.added + res.updated > 0 && <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { setRes(await cmdbApi.importRows(rows, false)); onDone(); } catch (e) { setError(errText(e)); } finally { setBusy(false); } }}>Import {res.added + res.updated} item(s)</Button>}
        </div>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {res && <Notice tone={res.errors.length ? 'warn' : 'good'}>{res.dryRun ? 'Checked' : 'Imported'}: {res.added} new, {res.updated} updated, {res.errors.length} with errors.</Notice>}
        {res && res.errors.length > 0 && <ul className="max-h-40 overflow-y-auto rounded-lg border border-line p-2 text-2xs">{res.errors.map((e, i) => <li key={i}><b>Row {e.line}{e.code ? ` (${e.code})` : ''}:</b> {e.error}</li>)}</ul>}
      </div>
    </Card>
  );
}
