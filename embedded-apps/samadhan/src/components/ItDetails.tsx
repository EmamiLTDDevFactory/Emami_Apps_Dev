'use client';
import { Fragment, useEffect, useState } from 'react';
import { ClipboardPaste, Pencil, Save } from 'lucide-react';
import { saveIt } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime } from '@/lib/format';
import type { ItDetails } from '@/lib/types';
import { MasterInput } from './Sap';
import { Button, Card, Field, Notice, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

/*
   v7 Phase 5 (master prompt §I ticket_it_details, §N): IT details for Digital Apps and Infra & IT tickets - the form
   (New ticket, edit view of the card), the card on the ticket and a small "paste error text" helper that picks up
   the HTTP status, a correlation / request id, the URL and an IP address.
*/
const sel = cx('h-9 w-full', inputBase);
type Key = keyof ItDetails;
type Spec = { key: Key; label: string; list?: keyof NonNullable<ReturnType<typeof useSamadhan>['meta']['itLists']>; master?: string; placeholder?: string; wide?: boolean };

const DIGITAL: Spec[] = [
  { key: 'layer', label: 'Layer', list: 'layer' }, { key: 'environment', label: 'Environment', list: 'environment' }, { key: 'platform', label: 'Platform', list: 'platform' },
  { key: 'browser', label: 'Browser', list: 'browser' }, { key: 'appVersion', label: 'App version', placeholder: 'e.g. 2.4.1' }, { key: 'httpStatus', label: 'HTTP status', placeholder: 'e.g. 503' },
  { key: 'url', label: 'Page URL', placeholder: 'https://', wide: true }, { key: 'apiEndpoint', label: 'API endpoint', placeholder: '/api/orders' }, { key: 'odataService', label: 'OData service' },
  { key: 'correlationId', label: 'Correlation / request id' }, { key: 'database', label: 'Database', list: 'database' }, { key: 'hosting', label: 'Hosting', list: 'hosting' },
];
const INFRA: Spec[] = [
  { key: 'environment', label: 'Environment', list: 'environment' }, { key: 'hosting', label: 'Hosting', list: 'hosting' }, { key: 'serverName', label: 'Server', master: 'SERVER' },
  { key: 'ipOrHost', label: 'IP / host' }, { key: 'assetTag', label: 'Asset tag' }, { key: 'siteLocation', label: 'Site / location', master: 'SITE' },
  { key: 'deviceModel', label: 'Device model' }, { key: 'os', label: 'Operating system', list: 'os' }, { key: 'database', label: 'Database', list: 'database' },
];
export const itSpecFor = (deskKey?: string | null) => (deskKey === 'INFRA_IT' ? INFRA : DIGITAL);

/** Picks the HTTP status, a correlation / request id, the URL and an IP from pasted error text (proposals only). */
export function parseItText(raw: string): Partial<ItDetails> {
  const t = String(raw || '');
  const out: Partial<ItDetails> = {};
  const status = t.match(/\b(?:HTTP\/\d(?:\.\d)?\s+|status(?:\s*code)?\s*[:=]?\s*)([1-5]\d{2})\b/i);
  if (status) out.httpStatus = status[1];
  const corr = t.match(/\b(?:x-)?(?:correlation|request|trace)[-_ ]?id\s*[:=]\s*([A-Za-z0-9-]{6,80})/i) ?? t.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (corr) out.correlationId = corr[1];
  const url = t.match(/\bhttps?:\/\/[^\s"'<>]+/i);
  if (url) out.url = url[0].replace(/[).,;]+$/, '');
  const ip = t.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
  if (ip) out.ipOrHost = ip[1];
  return out;
}

export function ItFields({ value, onChange, deskKey, compact = false }: { value: Partial<ItDetails>; onChange: (v: Partial<ItDetails>) => void; deskKey?: string | null; compact?: boolean }) {
  const { meta } = useSamadhan();
  const L = meta.itLists;
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState('');
  const s = (k: Key) => (value[k] as string | null | undefined) ?? '';
  const set = (k: Key, v: unknown) => onChange({ ...value, [k]: v === '' ? null : v });
  const found = parseItText(text);
  return (
    <div className="space-y-3" data-testid="it-fields">
      <div className={cx('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-3')}>
        {itSpecFor(deskKey).map((f) => (
          <Field key={f.key} label={f.label} className={f.wide && !compact ? 'sm:col-span-2' : undefined}>
            {f.list ? (
              <select className={sel} value={s(f.key)} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{(L?.[f.list] ?? []).map((x) => <option key={x}>{x}</option>)}</select>
            ) : f.master ? (
              <MasterInput kind={f.master} label={f.label} value={s(f.key)} onChange={(v) => set(f.key, v)} />
            ) : (
              <input className={inputCls} value={s(f.key)} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} />
            )}
          </Field>
        ))}
        <Field label="Users affected"><input className={inputCls} type="number" min={0} value={value.usersAffected ?? ''} onChange={(e) => set('usersAffected', e.target.value === '' ? null : Number(e.target.value))} /></Field>
      </div>
      {deskKey !== 'INFRA_IT' && (
        <div>
          <button type="button" className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline" onClick={() => setPaste((p) => !p)}><ClipboardPaste size={12} /> Paste error text / response</button>
          {paste && (
            <div className="mt-2 space-y-2">
              <textarea rows={4} className={textareaCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the error, the response headers or a log line" aria-label="Error text" />
              {Object.keys(found).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-2xs" data-testid="it-paste-result">
                  {Object.entries(found).map(([k, v]) => <span key={k} className="rounded-md bg-sunken px-1.5 py-0.5"><span className="text-muted">{k}:</span> <b>{String(v)}</b></span>)}
                  <Button size="sm" variant="primary" onClick={() => { onChange({ ...value, ...found }); setText(''); setPaste(false); }}>Use these values</Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ticket sidebar card: IT details read-only; Edit opens the form. */
export function ItCard({ ticketId, it, deskKey, reload }: { ticketId: number; it: ItDetails | null | undefined; deskKey?: string | null; reload: () => Promise<void> }) {
  const { can } = useSamadhan();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ItDetails>>(it ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setForm(it ?? {}); }, [it]);
  const save = async () => {
    setBusy(true);
    setError('');
    try { await saveIt(ticketId, form); setEditing(false); await reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };
  const rows = it ? [...itSpecFor(deskKey), { key: 'usersAffected' as Key, label: 'Users affected' }]
    .map((f) => [f.label, it[f.key] != null && it[f.key] !== '' ? String(it[f.key]) : null] as const).filter(([, v]) => v) : [];
  return (
    <Card title={deskKey === 'INFRA_IT' ? 'IT details' : 'App details'} sub={it?.updatedAt ? `Updated ${fmtDateTime(it.updatedAt)}` : deskKey === 'INFRA_IT' ? 'Server, asset, site' : 'Layer, URL, status, correlation id'}
      actions={can('ticket.edit') && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}>
      <div data-testid="it-card">
        {editing ? (
          <div className="space-y-3">
            <ItFields value={form} onChange={setForm} deskKey={deskKey} compact />
            {error && <Notice onClose={() => setError('')}>{error}</Notice>}
            <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : <Save size={13} />} Save</Button><Button onClick={() => { setEditing(false); setForm(it ?? {}); }}>Cancel</Button></div>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-2xs text-muted">No details yet.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-semibold">{k === 'Page URL' && v ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{v}</a> : v}</dd></Fragment>)}
          </dl>
        )}
      </div>
    </Card>
  );
}
