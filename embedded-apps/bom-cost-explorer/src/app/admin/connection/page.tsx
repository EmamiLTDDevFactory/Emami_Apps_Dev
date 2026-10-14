'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, Play, XCircle } from 'lucide-react';
import { loadSapConfig } from '@/lib/sap/config';
import { sapGet, SapError } from '@/lib/sap/client';
import { ENTITY_SET, NAV_RATE_OPTIONS } from '@/lib/sap/entities';
import { buildSelectionFilter } from '@/lib/sap/filter';
import { defaultQuery } from '@/lib/query/schema';
import { parseMetadata, checkMetadata } from '@/lib/sap/metadataCheck';
import { getRatesCapability, resetRatesCapability, type RatesCapability } from '@/lib/rates/capability';
import { clearRatesCache, fetchRateOptions } from '@/lib/rates/options';
import { unwrapCollection } from '@/lib/sap/normalize';
import { BASE_PATH, useHubSession } from '@/lib/client/session';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { EnvBadge } from '@/components/Shell';
import { Button, Card, cx, inputCls } from '@/components/ui';

interface Probe { name: string; status: 'pending' | 'ok' | 'fail' | 'idle'; http?: number; ms?: number; detail?: string; header?: boolean }

async function probe(name: string, path: string, params: Record<string, string | undefined>): Promise<Probe & { body?: unknown }> {
  const t0 = performance.now();
  try {
    const r = await sapGet(path, params, { timeoutMs: 230_000 });
    const rows = path === '$metadata' ? undefined : unwrapCollection(r.body).results.length;
    return { name, status: 'ok', http: r.status, ms: Math.round(r.ms), header: r.sapMessageHeader, detail: rows === undefined ? `${String(r.body).length.toLocaleString('en-IN')} bytes` : `${rows} row(s)`, body: r.body };
  } catch (e) {
    const err = e as SapError;
    return { name, status: 'fail', http: err.sapStatus || undefined, ms: Math.round(performance.now() - t0), detail: err.message };
  }
}

const Status = ({ s }: { s: Probe['status'] }) =>
  s === 'ok' ? <CheckCircle2 size={16} className="text-good" /> : s === 'fail' ? <XCircle size={16} className="text-bad" /> : <CircleDashed size={16} className={cx('text-faint', s === 'pending' && 'animate-spin')} />;

export default function ConnectionPage() {
  const hub = useHubSession();
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [matnr, setMatnr] = useState('');
  const [werks, setWerks] = useState('');
  const [probes, setProbes] = useState<Probe[]>([]);
  const [meta, setMeta] = useState<ReturnType<typeof checkMetadata> | null>(null);
  const [sets, setSets] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [cap, setCap] = useState('');
  const [rcap, setRcap] = useState<RatesCapability | null>(null);
  const [rprobing, setRprobing] = useState(false);
  const [rnote, setRnote] = useState('');

  useEffect(() => {
    if (hub && hub !== 'checking') void fetchIsAdmin(hub.email).then(setAdmin);
    else if (hub === null) setAdmin(false);
  }, [hub]);
  useEffect(() => {
    if (cfg?.ok) {
      const rc = getRatesCapability(cfg.config.system);
      setCap(rc.state);
      setRcap(rc);
    }
  }, [cfg]);

  if (!cfg || hub === 'checking' || admin === null) return <div className="grid h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  if (!admin) return <div className="grid h-screen place-items-center p-6 text-center text-sm text-muted">Connection diagnostics are for BOM Simulator admins (Manage Access role "Admin").</div>;
  if (!cfg.ok) return <div className="p-6 text-sm text-bad">{cfg.error}</div>;
  const c = cfg.config;

  const run = async () => {
    setRunning(true);
    setMeta(null);
    const list: Probe[] = [
      { name: 'a) $metadata', status: 'pending' },
      { name: `b) ${ENTITY_SET.CONFIG}`, status: 'pending' },
      { name: `c) ${ENTITY_SET.PLANTS}?$top=1`, status: 'pending' },
      { name: `d1) ${ENTITY_SET.COST_LINES} without $expand`, status: matnr && werks ? 'pending' : 'idle', detail: matnr && werks ? undefined : 'enter a material and a plant' },
      { name: `d2) ${ENTITY_SET.COST_LINES} with $expand=${NAV_RATE_OPTIONS}`, status: matnr && werks ? 'pending' : 'idle', detail: matnr && werks ? undefined : 'enter a material and a plant' },
    ];
    setProbes([...list]);
    const set = (i: number, p: Probe) => {
      list[i] = p;
      setProbes([...list]);
    };
    const md = await probe(list[0].name, '$metadata', {});
    set(0, md);
    if (md.status === 'ok') {
      const parsed = parseMetadata(String(md.body));
      setSets(Array.from(parsed.sets.keys()));
      setMeta(checkMetadata(parsed));
    }
    set(1, await probe(list[1].name, ENTITY_SET.CONFIG, {}));
    set(2, await probe(list[2].name, ENTITY_SET.PLANTS, { $top: '1' }));
    if (matnr && werks) {
      const $filter = buildSelectionFilter({ ...defaultQuery('B'), materials: [matnr.trim().toUpperCase()], plants: [werks.trim().toUpperCase()] });
      set(3, await probe(list[3].name, ENTITY_SET.COST_LINES, { $filter }));
      set(4, await probe(list[4].name, ENTITY_SET.COST_LINES, { $filter, $expand: NAV_RATE_OPTIONS }));
    }
    setRunning(false);
  };
  const header = probes.some((p) => p.header);

  return (
    <div className="min-h-screen bg-bg">
      <a href={`${BASE_PATH}/`} className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to BOM Simulator</a>
      <div className="mx-auto max-w-6xl space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-extrabold">SAP connection diagnostics</h1>
          <EnvBadge system={c.system} appEnv={c.appEnv} />
        </div>
        <Card title="Active connection">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-2xs font-bold uppercase text-faint">System</dt><dd className="font-mono">{c.system} ({c.appEnv})</dd></div>
            <div><dt className="text-2xs font-bold uppercase text-faint">Base URL</dt><dd className="break-all font-mono text-xs">{c.baseUrl}</dd></div>
            <div><dt className="text-2xs font-bold uppercase text-faint">Auth</dt><dd className="font-mono">{c.authMode}{c.client ? ` · sap-client ${c.client}` : ' · no sap-client sent'}</dd></div>
            <div>
              <dt className="text-2xs font-bold uppercase text-faint">Rate options</dt>
              <dd className="flex items-center gap-2 font-mono">
                {c.expand === 'off' ? 'off' : cap || 'unknown'}
                {rcap?.at ? <span className="text-2xs text-faint">since {new Date(rcap.at).toLocaleTimeString()}</span> : null}
                <Button size="sm" onClick={() => { resetRatesCapability(c.system); clearRatesCache(); setCap('unknown'); setRcap(getRatesCapability(c.system)); }}>Re-test</Button>
              </dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Rate options capability"
          actions={
            <Button
              size="sm"
              disabled={rprobing || !matnr.trim() || !werks.trim()}
              title={!matnr.trim() || !werks.trim() ? 'Enter a material and plant under Checks first' : 'Forget the verdict and probe direct, then expand'}
              onClick={async () => {
                setRprobing(true);
                setRnote('');
                resetRatesCapability(c.system);
                clearRatesCache();
                try {
                  const r = await fetchRateOptions({ ...defaultQuery('B'), materials: [matnr.trim().toUpperCase()], plants: [werks.trim().toUpperCase()], explQty: '1' });
                  setRnote('unavailable' in r ? r.reason : `${r.rows.length} option row(s) via ${r.mode}`);
                } catch (e) {
                  setRnote((e as Error).message);
                } finally {
                  const rc = getRatesCapability(c.system);
                  setRcap(rc);
                  setCap(rc.state);
                  setRprobing(false);
                }
              }}
            >
              <Play size={14} /> {rprobing ? 'Probing…' : 'Probe now'}
            </Button>
          }
        >
          <p className="mb-2 text-xs text-muted">
            Rate options load lazily (never on the main costing run): first RateOptionSet with the costing filter (direct), then CostLineSet with $expand=RateOptions. A verdict holds 15 minutes.
            {rnote && <span className="ml-1 font-semibold text-ink">{rnote}</span>}
          </p>
          {rcap?.probes.length ? (
            <table className="w-full text-xs">
              <thead className="text-left text-2xs font-bold uppercase text-faint"><tr><th className="py-1">Probe</th><th>HTTP</th><th>Latency</th><th>Result / SAP message</th></tr></thead>
              <tbody>
                {rcap.probes.map((p, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="py-1 font-mono">{p.kind}</td>
                    <td className={cx('font-mono', p.ok ? 'text-good' : 'text-bad')}>{p.status || '-'}</td>
                    <td className="font-mono">{p.ms} ms</td>
                    <td className="break-all">{p.ok ? 'OK' : p.message}<div className="font-mono text-faint">{p.url}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-faint">No probe yet on this browser (state: {cap || 'unknown'}).</p>
          )}
        </Card>

        <Card title="Checks" actions={<Button variant="primary" onClick={run} disabled={running}><Play size={14} /> {running ? 'Running…' : 'Run checks'}</Button>}>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-muted">Material (d)<input className={cx(inputCls, 'mt-1 w-44')} value={matnr} onChange={(e) => setMatnr(e.target.value)} placeholder="e.g. 400000001" /></label>
            <label className="text-xs font-bold text-muted">Plant (d)<input className={cx(inputCls, 'mt-1 w-28')} value={werks} onChange={(e) => setWerks(e.target.value)} placeholder="e.g. UN09" /></label>
            <p className="pb-2 text-xs text-faint">All calls are GET, from this browser straight to the SAP gateway.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="text-2xs font-bold uppercase tracking-wide text-faint"><tr><th className="py-1.5 text-left">Check</th><th className="text-left">Status</th><th className="text-right">HTTP</th><th className="text-right">Latency</th><th className="pl-4 text-left">Detail</th></tr></thead>
            <tbody>
              {probes.map((p) => (
                <tr key={p.name} className="border-t border-line/70 align-top">
                  <td className="py-1.5 font-mono text-xs">{p.name}</td>
                  <td className="py-1.5"><Status s={p.status} /></td>
                  <td className="num py-1.5 text-right">{p.http ?? '—'}</td>
                  <td className="num py-1.5 text-right">{p.ms !== undefined ? `${p.ms.toLocaleString('en-IN')} ms` : '—'}</td>
                  <td className={cx('py-1.5 pl-4 text-xs', p.status === 'fail' ? 'text-bad' : 'text-muted')}>{p.detail}</td>
                </tr>
              ))}
              {probes.length > 0 && (
                <tr className="border-t border-line/70">
                  <td className="py-1.5 font-mono text-xs">e) sap-message header</td>
                  <td className="py-1.5"><Status s={running ? 'pending' : header ? 'ok' : 'fail'} /></td>
                  <td colSpan={3} className="py-1.5 pl-4 text-xs text-muted">
                    {header ? 'Received on at least one response.' : 'Not received. Cross-origin the browser only sees it if the gateway sends Access-Control-Expose-Headers: sap-message (or SAP sent no message).'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {sets.length > 0 && (
          <Card title="$metadata">
            <p className="mb-2 text-sm"><strong>Entity sets:</strong> <span className="font-mono text-xs">{sets.join(', ')}</span></p>
            {meta && (
              <>
                <p className="mb-1 text-sm"><strong>RateOptions navigation:</strong> {meta.hasRateOptionsNav ? <span className="text-good">present</span> : <span className="font-bold text-bad">missing</span>}</p>
                <p className="mb-3 text-sm"><strong>First 10 CostLine properties:</strong> <span className="font-mono text-xs">{meta.costLineFirstProps.join(', ') || '—'}</span></p>
                <p className={cx('mb-2 text-sm font-bold', meta.ok ? 'text-good' : 'text-bad')}>
                  {meta.ok ? '✓ Every entity set, the navigation and every property used by the code exists.' : `✗ ${meta.counts.bad} name(s) used by the code are missing - fix src/lib/sap/fields.ts / entities.ts.`}
                  <span className="ml-2 font-normal text-muted">{meta.counts.ok} OK · {meta.counts.warn} warnings · filterable {meta.counts.filterable}/{meta.counts.filterTotal}</span>
                </p>
                <div className="scroll-thin max-h-96 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-panel text-faint"><tr><th className="px-2 py-1 text-left">Area</th><th className="text-left">Name in code</th><th className="text-left">Status</th><th className="text-left">Detail</th></tr></thead>
                    <tbody>
                      {meta.rows.filter((r) => r.status !== 'OK').concat(meta.rows.filter((r) => r.status === 'OK' && (r.area === 'EntitySet' || r.area === 'Navigation'))).map((r, i) => (
                        <tr key={i} className={cx('border-t border-line/60', (r.status === 'MISSING' || r.status === 'TYPE') && 'bg-bad/10 font-semibold text-bad')}>
                          <td className="px-2 py-1 font-mono">{r.area}</td><td className="font-mono">{r.name}</td><td>{r.status}</td><td>{r.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        )}
        {probes[0]?.status === 'fail' && (
          <p className="text-xs text-muted">$metadata could not be read through this gateway, so the name check cannot run here; run <code>npm run check:metadata</code> against the Gateway itself.</p>
        )}
      </div>
    </div>
  );
}
