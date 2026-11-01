'use client';
/**
 * The reasons behind the variance of one finished good (or WIP): its components with SAP's cost per unit and how far the actual cost is above (increase) or
 * below (decrease) each other rate source (C-MAP, consumption, average). SAP's live costing of that one material (WacCompSet) runs when this opens; no time limit.
 */
import { useEffect, useMemo, useRef } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button, Spinner } from '../ui';
import { fmtNum } from '@/lib/format';
import { useWacComponents } from '@/lib/wac/useWac';
import type { WacFilterInput } from '@/lib/wac/filter';
import type { WacCompRow } from '@/lib/wac/types';
import { dec, fmtVarPct, sortComponents } from '@/lib/wac/view';
import { direction, ratioText, type ReportRow } from '@/lib/psum/report';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint">n/a</span>;
const GRP: Record<string, string> = { RM: 'RM', PM: 'PM', PERF: 'Perfume' };

export default function ReasonsModal({ row, period, onClose }: { row: ReportRow; period: { dateFrom: string; dateTo: string }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  const fg = row.fg;
  const q: WacFilterInput = useMemo(() => ({ plants: [fg.Werks], dateFrom: period.dateFrom, dateTo: period.dateTo, materials: [fg.Matnr] }), [fg.Werks, fg.Matnr, period]);
  const comps = useWacComponents(q, true, q);
  const rows = (comps.entry?.status === 'done' ? comps.entry.data : null) as WacCompRow[] | null;
  const sorted = useMemo(() => (rows ? sortComponents(rows) : []), [rows]);
  const up = sorted.filter((c) => direction(c) === 'up').length, down = sorted.filter((c) => direction(c) === 'down').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 no-print" role="dialog" aria-modal="true" aria-label={`Reasons of the variance of ${fg.Matnr}`}>
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative flex max-h-[90vh] w-full max-w-6xl animate-slideUp flex-col rounded-2xl border border-line bg-panel shadow-pop outline-none">
        <div className="flex items-start gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <div className="text-lg font-extrabold"><span className="font-mono">{fg.Matnr}</span> <span className="font-semibold">{fg.Maktx}</span></div>
            <div className="text-xs text-muted">Plant {fg.Werks} · COGM per pc {fmtNum(row.cogm, 4, 'INR')} INR{row.sim ? <> · simulated {fmtNum(row.sim, 4, 'INR')} INR (computed here){row.variance ? <>, variance {row.variance.gt(0) ? '▲ +' : '▼ '}{fmtNum(row.variance, 4, 'INR')}</> : null}</> : null}{row.rSp ? <> · selling price : COGM {ratioText(row.rSp)}</> : null}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto shrink-0" aria-label="Close"><X size={15} /> Close</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {!rows ? (
            comps.entry?.status === 'error' ? <p role="alert" className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">{comps.entry.error} <button className="font-semibold underline" onClick={comps.retry}>Retry</button></p>
              : comps.entry?.status === 'cancelled' ? <p className="text-sm text-muted">Cancelled. <button className="font-semibold text-accent underline" onClick={comps.retry}>Load again</button></p>
              : <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Costing this material in SAP… this can take a while (no time limit).</p>
          ) : sorted.length === 0 ? <p className="text-sm text-muted">SAP returned no components for this material.</p> : (
            <div className="flex flex-col gap-3">
              <p className="text-sm"><b>{up}</b> component{up === 1 ? '' : 's'} with an <b>increase</b> (actual cost above a rate source) · <b>{down}</b> with a <b>decrease</b> · {sorted.length - up - down} without a variance from SAP. Largest variance first.</p>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-sunken"><tr><th className={th}>Reason</th><th className={th}>Group</th><th className={th}>Component</th><th className={thN}>Qty / unit</th><th className={thN}>Cost / unit</th><th className={thN}>vs C-MAP</th><th className={thN}>vs Consumption</th><th className={thN}>vs Average</th></tr></thead>
                  <tbody>
                    {sorted.map((c) => {
                      const d = direction(c);
                      return (
                        <tr key={`${c.Idnrk}|${c.Rowid}`} className={d === 'up' ? 'border-t border-line/60 bg-bad/[0.05]' : d === 'down' ? 'border-t border-line/60 bg-good/[0.06]' : 'border-t border-line/60'}>
                          <td className={td}>{d === 'up' ? <span className="inline-flex items-center gap-1 font-bold text-bad"><ArrowUp size={13} aria-hidden /> Increase</span> : d === 'down' ? <span className="inline-flex items-center gap-1 font-bold text-good"><ArrowDown size={13} aria-hidden /> Decrease</span> : <span className="text-faint">No variance</span>}</td>
                          <td className={td}>{GRP[c.Grp] ?? c.Grp}</td>
                          <td className={td}><span className="font-mono font-bold">{c.Idnrk}</span> <span className="text-muted">{c.CompTxt}</span></td>
                          <td className={tdN}>{fmtNum(c.QtyPu, 4, 'X')} {c.Uom}</td>
                          <td className={tdN}>{dec(c.CostSel) === null ? NA : fmtNum(c.CostSel, 4, 'INR')}</td>
                          <td className={tdN}>{fmtVarPct(c.VarpCmap)}</td><td className={tdN}>{fmtVarPct(c.VarpCon)}</td><td className={tdN}>{fmtVarPct(c.VarpAvg)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">&quot;+&quot; means the actual cost is above that rate source (cost up), &quot;−&quot; below it (cost down). SAP computes these percentages at today&apos;s rates and the current BOM; the reason is the component, not a guess.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
