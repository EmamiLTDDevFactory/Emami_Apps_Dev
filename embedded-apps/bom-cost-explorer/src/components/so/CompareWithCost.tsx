'use client';
/**
 * "Compare with cost (SAP)": the live cost simulator (CogmRowSet, PriceSrcIn = 'O' = the latest sales orders) for at most 25 finished
 * goods. Every figure below is SAP's; nothing is computed here. Starts only on the button, has no time limit, and Stop ends it.
 * Reusable: the Sales price page and the price strip both use it.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ExternalLink, Play, Square } from 'lucide-react';
import { Button, Spinner, cx } from '../ui';
import WacMessages from '../wac/WacMessages';
import { fmtMs, fmtNum } from '@/lib/format';
import { ensure, peek, stop, subscribe } from '@/lib/wac/cache';
import { COGM_MAX_MATERIALS } from '@/lib/so/filter';
import { fetchCogm } from '@/lib/so/service';
import { EMPTY_LIST, type CogmRow, type ListFilter } from '@/lib/so/types';
import { cogmHasValue, cogmKey } from '@/lib/so/view';
import { COGM_ENABLED } from '@/lib/margin/flag';
import { DEFAULT_SEL, marginSearch } from '@/lib/margin/selection';
import { BASE_PATH } from '@/lib/client/session';

export interface CompareSelection { vkorg: string[]; vtweg?: string[]; segment?: string[]; daysBack?: number; auart?: ListFilter; pstyv?: ListFilter; kdgrp?: ListFilter; kunnr?: ListFilter }

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const na = <span className="text-faint" title="No value from SAP">n/a</span>;
const money = (v: string, curr: string, dp = 2) => (cogmHasValue(v) ? <>{fmtNum(v, dp, curr)} <span className="text-2xs text-muted">{curr}</span></> : na);
const plain = (v: string, dp = 4) => (cogmHasValue(v) ? fmtNum(v, dp, 'X') : na);

/** The Margin Board link of the same selection: latest sales order (PriceSrcIn 'O'), the sales area, days and the include / exclude lists. The Board never runs from the URL. */
export const marginBoardHref = (materials: string[], plants: string[] | undefined, s: CompareSelection): string =>
  `${BASE_PATH}/margin/${marginSearch({ ...DEFAULT_SEL, materials, plants: plants ?? [], priceSrc: 'O', vkorg: s.vkorg, vtweg: s.vtweg ?? [], segment: s.segment?.[0] ?? '', days: s.daysBack ?? DEFAULT_SEL.days, auart: s.auart ?? EMPTY_LIST, pstyv: s.pstyv ?? EMPTY_LIST, kdgrp: s.kdgrp ?? EMPTY_LIST, kunnr: s.kunnr ?? EMPTY_LIST })}`;

export function cogmQuery(materials: string[], plants: string[] | undefined, s: CompareSelection) {
  return { materials: materials.slice(0, COGM_MAX_MATERIALS), plants, vkorg: s.vkorg, vtweg: s.vtweg, segment: s.segment, daysBack: s.daysBack, auart: s.auart ?? EMPTY_LIST, pstyv: s.pstyv ?? EMPTY_LIST, kdgrp: s.kdgrp ?? EMPTY_LIST, kunnr: s.kunnr ?? EMPTY_LIST };
}

export default function CompareWithCost({ materials, plants, selection, onRows, className }: { materials: string[]; plants?: string[]; selection: CompareSelection; onRows?: (rows: CogmRow[]) => void; className?: string }) {
  const q = useMemo(() => cogmQuery(materials, plants, selection), [materials, plants, selection]);
  const key = `so|COGM|${JSON.stringify(q)}`;
  const ctx = key;
  const entry = useSyncExternalStore(subscribe, () => peek<CogmRow>(key), () => undefined);
  const [elapsed, setElapsed] = useState(0);
  const loading = entry?.status === 'loading';
  useEffect(() => {
    if (!loading || !entry) return;
    const t = setInterval(() => setElapsed(Date.now() - entry.startedAt), 250);
    return () => clearInterval(t);
  }, [loading, entry]);
  useEffect(() => { onRows?.(entry?.status === 'done' ? entry.data ?? [] : []); }, [entry, onRows]);

  const run = () => { void ensure<CogmRow>(key, ctx, 'COGM', (signal) => fetchCogm(q, { signal }), entry?.status === 'done'); };
  const rows = entry?.status === 'done' ? entry.data ?? [] : [];
  const cut = materials.length > COGM_MAX_MATERIALS;

  // With the Margin module on, "Compare with cost" opens the Margin Board with this selection (it runs there, on its own button). Off: the inline comparison below, as before.
  if (COGM_ENABLED) {
    return (
      <div className={cx('flex flex-wrap items-center gap-2', className)}>
        <a href={marginBoardHref(materials, plants, selection)} className={cx('inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold hover:bg-sunken', !materials.length && 'pointer-events-none opacity-50')} aria-disabled={!materials.length}>
          <ExternalLink size={13} aria-hidden /> Compare with cost (SAP)
        </a>
        <span className="text-xs text-faint">Opens the Margin board with this selection (latest sales order). The producing plant is chosen there; nothing runs until you press Show.</span>
      </div>
    );
  }

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {loading ? (
          <Button size="sm" variant="ghost" onClick={() => stop(ctx)}><Square size={13} /> Stop ({fmtMs(elapsed)})</Button>
        ) : (
          <Button size="sm" onClick={run} disabled={!materials.length}><Play size={13} /> Compare with cost (SAP)</Button>
        )}
        <span className="text-xs text-faint">Live costing: about 10-15 s per 25 finished goods; at most {COGM_MAX_MATERIALS} finished goods per run.{cut ? ` The first ${COGM_MAX_MATERIALS} of ${materials.length} are used.` : ''}</span>
      </div>
      {entry?.status === 'cancelled' && <p className="text-sm text-muted">Stopped.</p>}
      {loading && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> SAP is costing… {fmtMs(elapsed)}</p>}
      <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />
      {entry?.status === 'done' && !rows.length && <p className="text-sm text-muted">SAP returned no comparison for this selection (no usable order, or nothing costed).</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-sunken"><tr>
              <th className={th}>Finished good</th><th className={th}>Plant</th><th className={th}>Sales org</th><th className={th}>Channel / doc type</th>
              <th className={thN}>MRP</th><th className={thN}>Selling price</th><th className={thN}>Standard cost</th><th className={thN}>Current cost</th>
              <th className={thN} title="SAP's ratio">Ratio (standard)</th><th className={thN} title="SAP's ratio">Ratio (current)</th>
              <th className={thN} title="Amount remaining after manufacturing cost, at current cost">Amount remaining (current)</th>
              <th className={thN}>Erosion</th><th className={thN}>Annual impact</th><th className={thN}>Selling price to restore</th><th className={th}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={cogmKey(r)} className="border-t border-line/60">
                  <td className={td}><span className="font-mono font-bold text-accent">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span></td>
                  <td className={td}>{r.Werks}</td><td className={td}>{r.Market}</td><td className={td}>{r.Channel}</td>
                  <td className={tdN}>{money(r.Mrp, r.Curr)} <span className="text-2xs text-muted">/{r.SellUom}</span></td>
                  <td className={tdN}>{money(r.SellPrice, r.Curr)} <span className="text-2xs text-muted">/{r.SellUom}</span></td>
                  <td className={tdN}>{money(r.CogmStd, r.Curr)}</td><td className={tdN}>{money(r.CogmCur, r.Curr)}</td>
                  <td className={tdN}>{plain(r.RatioStd)}</td><td className={tdN}>{plain(r.RatioCur)}</td>
                  <td className={tdN}>{money(r.RemainCur, r.Curr)}</td>
                  <td className={tdN}>{cogmHasValue(r.ErosionPct) ? `${fmtNum(r.ErosionPct, 2, 'X')} %` : na}</td>
                  <td className={tdN}>{cogmHasValue(r.AnnualImpactInr) ? <>{fmtNum(r.AnnualImpactInr, 0, 'INR')} <span className="text-2xs text-muted">INR</span></> : na}</td>
                  <td className={tdN}>{money(r.ReqSpRestore, r.Curr)}</td>
                  <td className={td}>{r.Status || '—'}{r.Msg && <span className="ml-1 inline-flex items-center gap-0.5 text-warn" title={r.Msg}><AlertTriangle size={12} aria-hidden /><span className="sr-only">{r.Msg}</span></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2.5 py-1.5 text-2xs text-faint">All values are SAP's. Prices are in the currency shown next to each amount; nothing is converted here. {entry?.ms ? `${fmtMs(entry.ms)} in SAP.` : ''}</p>
        </div>
      )}
    </div>
  );
}
export { CompareWithCost };
