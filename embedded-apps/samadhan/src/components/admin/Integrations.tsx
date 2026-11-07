'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Cloud, Copy, FileUp, KeyRound, MessageSquare, Plus, RefreshCw, Upload } from 'lucide-react';
import { integrationsAdmin, samadhanApiUrl } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime } from '@/lib/format';
import type { IntegrationRow, IntegrationsOverview, SolmanResult } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, Spinner, Table, cx, inputBase, inputCls } from '../ui';

/*
   v7 Phase 9 Admin > Integrations (master prompt §Q): SAP Cloud ALM (API key), monitoring sources (one token each),
   Teams (outbound webhook), SolMan backlog import (column mapper, dry run, error report), and the last 50 calls.
   Everything is off until switched on here. Keys and tokens are shown once, when they are made.
*/
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');

function Secret({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  return (
    <Notice tone="warn" onClose={onClose}>
      <div className="space-y-1"><b>{label} - copy it now, it is not shown again:</b>
        <div className="flex items-center gap-2"><code className="break-all rounded bg-panel px-2 py-1 text-xs">{value}</code>
          <button type="button" aria-label="Copy" className="text-accent" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={14} /></button></div>
      </div>
    </Notice>
  );
}

export function IntegrationsTab() {
  const { meta } = useSamadhan();
  const [data, setData] = useState<IntegrationsOverview | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const load = useCallback(() => { integrationsAdmin.overview().then(setData).catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  if (!data) return <Skeleton />;
  const row = (k: IntegrationRow['key']) => data.integrations.find((i) => i.key === k)!;
  const Toggle = ({ k }: { k: IntegrationRow['key'] }) => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={row(k).enabled} onChange={(e) => act(() => integrationsAdmin.save(k, { enabled: e.target.checked }), e.target.checked ? 'Switched on.' : 'Switched off.')} />
      {row(k).enabled ? <Pill tone="good">On</Pill> : <Pill>Off</Pill>}
    </label>
  );
  return (
    <div className="space-y-4" data-testid="admin-integrations">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {secret && <Secret label={secret.label} value={secret.value} onClose={() => setSecret(null)} />}

      <Card title={<span className="inline-flex items-center gap-1.5"><Cloud size={15} className="text-accent" /> SAP Cloud ALM → Samadhan</span>} sub="Cloud ALM situations become SAP tickets. Idempotent on the event-situation id; the reference is returned at once." actions={<Toggle k="calm" />}>
        <div className="space-y-2 text-xs">
          <div><span className="text-muted">Endpoint:</span> <code className="break-all">POST {samadhanApiUrl(data.endpoints.calm.replace('/api/samadhan', ''))}</code> · header <code>x-api-key</code></div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">API key:</span> {row('calm').hasSecret ? <code>{row('calm').secretHint}</code> : <span>none yet</span>}
            {row('calm').rotatedAt && <span className="text-faint">rotated {fmtDateTime(row('calm').rotatedAt ?? null)}</span>}
            <Button size="sm" onClick={async () => { try { const s = await integrationsAdmin.rotate('calm'); setSecret({ label: 'Cloud ALM API key', value: s }); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } }}><KeyRound size={13} /> {row('calm').hasSecret ? 'Rotate key' : 'Create key'}</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Application"><select className={cx('h-9 w-56', inputBase)} defaultValue={row('calm').config.applicationCode ?? 'SAP'} onChange={(e) => act(() => integrationsAdmin.save('calm', { applicationCode: e.target.value }), 'Mapping saved.')}>
              {(meta.applications ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.code}>{a.code} – {a.name}</option>)}</select></Field>
          </div>
        </div>
      </Card>

      <MonitoringCard data={data} toggle={<Toggle k="monitoring" />} onSecret={(v) => setSecret({ label: 'Monitoring token', value: v })} reload={load} onMsg={setMsg} />

      <Card title={<span className="inline-flex items-center gap-1.5"><MessageSquare size={15} className="text-accent" /> Microsoft Teams</span>} sub="A card in a Teams channel for major incidents, new Urgent tickets and approvals needed." actions={<Toggle k="teams" />}>
        <TeamsForm row={row('teams')} onSave={(b) => act(() => integrationsAdmin.save('teams', b), 'Teams settings saved.')} />
      </Card>

      <SolmanCard targets={data.solmanTargets} />

      <Card title={<span className="inline-flex items-center gap-1.5"><Activity size={15} className="text-accent" /> Last calls</span>} actions={<Button size="sm" onClick={load} aria-label="Refresh"><RefreshCw size={13} /></Button>} bodyClass="p-0">
        {data.calls.length === 0 ? <p className="p-4 text-sm text-muted">No calls yet.</p> : (
          <Table head={['When', 'Integration', 'Source', 'Result', 'Summary', 'Ticket']}>
            {data.calls.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(c.createdAt)}</td>
                <td className="px-3 py-2 text-xs">{c.integration}</td>
                <td className="px-3 py-2 text-xs">{c.source ?? '—'}</td>
                <td className="px-3 py-2">{c.ok ? <Pill tone="good">{c.status}</Pill> : <Pill tone="bad">{c.status || 'failed'}</Pill>}</td>
                <td className="px-3 py-2 text-xs">{c.summary}</td>
                <td className="num px-3 py-2 text-xs">{c.ticketId ? `#${c.ticketId}` : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function MonitoringCard({ data, toggle, onSecret, reload, onMsg }: { data: IntegrationsOverview; toggle: React.ReactNode; onSecret: (v: string) => void; reload: () => void; onMsg: (m: { tone: 'good' | 'bad'; text: string }) => void }) {
  const { meta } = useSamadhan();
  const [form, setForm] = useState({ name: '', applicationId: '', defaultPriority: '2' });
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Activity size={15} className="text-accent" /> Monitoring alerts → Samadhan</span>} sub="One token per tool (Zabbix, PRTG, Azure Monitor ...). A repeated alert adds a note to the open ticket; a cleared alert says so." actions={toggle}>
      <div className="space-y-3 text-xs">
        <div><span className="text-muted">Endpoint:</span> <code className="break-all">POST {samadhanApiUrl(data.endpoints.monitoring.replace('/api/samadhan', ''))}</code> · header <code>x-api-key</code> · body <code>{'{ alertKey, title, severity, host, status }'}</code></div>
        {data.sources.length > 0 && (
          <Table head={['Source', 'Application', 'Token', 'Default priority', '']}>
            {data.sources.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-semibold">{s.name} <span className="text-faint">#{s.id}</span></td>
                <td className="px-3 py-2">{s.applicationCode ?? '—'}</td>
                <td className="px-3 py-2"><code>{s.tokenHint}</code></td>
                <td className="px-3 py-2">{meta.priorities[s.defaultPriority]}</td>
                <td className="px-3 py-2 text-right"><Button size="sm" onClick={async () => { try { onSecret(await integrationsAdmin.rotateSource(s.id)); reload(); } catch (e) { onMsg({ tone: 'bad', text: errText(e) }); } }}><KeyRound size={13} /> New token</Button></td>
              </tr>
            ))}
          </Table>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_1fr_auto]">
          <Field label="Source name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Zabbix" /></Field>
          <Field label="Application"><select className={cx('h-9 w-full', inputBase)} value={form.applicationId} onChange={(e) => setForm({ ...form, applicationId: e.target.value })}><option value="">—</option>{(meta.applications ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.code} – {a.name}</option>)}</select></Field>
          <Field label="Default priority"><select className={cx('h-9 w-full', inputBase)} value={form.defaultPriority} onChange={(e) => setForm({ ...form, defaultPriority: e.target.value })}>{Object.entries(meta.priorities).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <div className="flex items-end"><Button variant="primary" disabled={!form.name.trim() || !form.applicationId} onClick={async () => {
            try { const r = await integrationsAdmin.saveSource({ name: form.name, applicationId: Number(form.applicationId), defaultPriority: Number(form.defaultPriority) }); if (r.token) onSecret(r.token); setForm({ name: '', applicationId: '', defaultPriority: '2' }); reload(); } catch (e) { onMsg({ tone: 'bad', text: errText(e) }); }
          }}><Plus size={14} /> Add source</Button></div>
        </div>
      </div>
    </Card>
  );
}

function TeamsForm({ row, onSave }: { row: IntegrationRow; onSave: (b: Record<string, unknown>) => void }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(row.config.events ?? ['major', 'urgent', 'approval']);
  const LABEL: Record<string, string> = { major: 'Major incidents', urgent: 'New Urgent tickets (outside Secondary Sales)', approval: 'Approval needed' };
  return (
    <div className="space-y-2 text-xs">
      {row.config.urlHint && <div><span className="text-muted">Webhook:</span> <code>{row.config.urlHint}</code></div>}
      <Field label="Incoming-webhook URL" hint="Teams channel > Connectors / Workflows > Incoming webhook"><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://...webhook.office.com/..." /></Field>
      <div className="flex flex-wrap gap-3">{Object.entries(LABEL).map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={events.includes(k)} onChange={(e) => setEvents(e.target.checked ? [...events, k] : events.filter((x) => x !== k))} /> {l}</label>)}</div>
      <Button size="sm" variant="primary" onClick={() => onSave({ ...(url.trim() ? { url: url.trim() } : {}), events })}>Save</Button>
    </div>
  );
}

const TARGET_LABEL: Record<string, string> = {
  externalId: 'SolMan ticket id *', subject: 'Subject *', description: 'Description', priority: 'Priority', status: 'Status', createdAt: 'Created on',
  requesterName: 'Reporter name', requesterEmail: 'Reporter email', category: 'Category / module', function: 'Sub-category', applicationCode: 'Application code (default SAP)',
};
function SolmanCard({ targets }: { targets: string[] }) {
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SolmanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const read = async (f: File) => {
    setError('');
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
      const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
      setRows(table);
      // Guess the mapping from common SolMan column names.
      const head = table[0] ?? [];
      const guess = (re: RegExp) => head.find((h) => re.test(h)) ?? '';
      setMapping({ externalId: guess(/^(ticket|transaction|id|object id|number)/i), subject: guess(/(title|subject|description short|short text)/i), description: guess(/(text|long|details)/i),
        priority: guess(/prio/i), status: guess(/(status|state)/i), createdAt: guess(/(created|date)/i), requesterName: guess(/(reporter|requester|contact)(?!.*mail)/i), requesterEmail: guess(/mail/i), category: guess(/(category|module|component)/i) });
    } catch { setError('Could not read that file - upload the SolMan export as .xlsx or .csv.'); }
    if (file.current) file.current.value = '';
  };
  const run = async (dryRun: boolean) => {
    if (!rows) return;
    setBusy(true);
    setError('');
    try { setResult(await integrationsAdmin.solman(rows, Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)), dryRun)); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const head = rows?.[0] ?? [];
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><FileUp size={15} className="text-accent" /> SolMan ITSM backlog import</span>} sub="One-off move of open SolMan tickets before SolMan's 2027 end of maintenance. Always dry-run first.">
      <div className="space-y-3 text-xs" data-testid="solman-import">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        <Button onClick={() => file.current?.click()}><Upload size={14} /> Choose the SolMan export</Button>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {rows && (
          <>
            <p className="text-muted">{rows.length - 1} rows read. Match the columns:</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {targets.map((t) => (
                <Field key={t} label={TARGET_LABEL[t] ?? t}>
                  <select className={cx('h-9 w-full', inputBase)} value={mapping[t] ?? ''} onChange={(e) => setMapping({ ...mapping, [t]: e.target.value })}><option value="">—</option>{head.map((h) => <option key={h} value={h}>{h}</option>)}</select>
                </Field>
              ))}
            </div>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => run(true)}>{busy ? <Spinner /> : null} Dry run</Button>
              <Button variant="primary" disabled={busy || !result?.dryRun || result.ok === 0} onClick={() => window.confirm(`Import ${result?.ok} tickets now?`) && run(false)}>Import</Button>
            </div>
          </>
        )}
        {result && (
          <div className="space-y-1">
            <Notice tone={result.errors.length ? 'warn' : 'good'}>{result.dryRun ? 'Dry run' : 'Import'}: {result.ok} ready{result.dryRun ? '' : `, ${result.created} created`}, {result.skipped} already imported, {result.errors.length} with errors.</Notice>
            {result.errors.length > 0 && <ul className="max-h-48 overflow-y-auto rounded-lg border border-line p-2">{result.errors.map((e, i) => <li key={i}><b>Line {e.line}:</b> {e.error}</li>)}</ul>}
          </div>
        )}
      </div>
    </Card>
  );
}
