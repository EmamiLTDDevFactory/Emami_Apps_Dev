'use client';
/**
 * Freight break-up of one cost line by condition type (lib/freight/breakup.ts). Loaded with next/dynamic only when
 * a freight value is clicked or the drawer section is opened, so with the flag off none of this code is loaded.
 *   FreightBreakupPanel    the content (also used inside the row drawer)
 *   default (dialog)       centred on the screen with a dimmed background, sized to fit one screen
 * Only the freight rows the costing used (non-zero per-piece amount) are listed, in bold; "Show all rows" adds the rest.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Pill, cx } from '../ui';
import type { CostLine } from '@/lib/sap/fields';
import { breakupLines, freightKeyOf, poSummary, reconcile, selectedRows, type FreightRun, type FreightView } from '@/lib/freight/breakup';
import { useFreightBreakup } from '@/lib/freight/useFreightBreakup';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';
import { componentFreightInr, componentFreightLoc, type FreightTagged } from '@/lib/cost/freightIncluded';
import { sourceLabel } from '@/lib/rates/sourceLabel';

const th = 'px-3 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-3 py-2 align-top';
const tdN = `${td} num text-right whitespace-nowrap`;

export function FreightBreakupPanel({ line, run, enabled = true, compactTitle = false }: { line: CostLine; run: FreightRun; enabled?: boolean; compactTitle?: boolean }) {
  const st = useFreightBreakup(freightKeyOf(line, run), enabled);
  const [view, setView] = useState<FreightView>(line.FrtSrc === 'STANDARD' ? 'STANDARD' : 'ACTUAL');
  const [showAll, setShowAll] = useState(false);
  const werks = line.Werks || line.Hwerks;
  const all = st.status === 'ready' ? st.rows : [];
  const used = selectedRows(all);
  const rows = showAll ? all : used;
  const hidden = all.length - used.length;
  const { lines, totals } = breakupLines(rows, view);
  const rec = st.status === 'ready' && all.length ? reconcile(all, line) : null;
  const pos = poSummary(used);
  const usedSet = new Set(used);

  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      {!compactTitle && (
        <div className="pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold">{line.Idnrk}</span>
            <span className="text-base font-semibold">{line.Maktx}</span>
            <span className="text-muted">- plant {werks}</span>
            {line.FrtSrc && <Pill tone={line.FrtSrc === 'ACTUAL' ? 'good' : 'neutral'} title="Freight source the costing used">{line.FrtSrc}</Pill>}
          </div>
          {pos.length > 0 && <div className="mt-1 text-xs text-muted">PO {pos.slice(0, 3).join(' · ')}{pos.length > 3 ? ` · +${pos.length - 3} more` : ''}</div>}
        </div>
      )}
      {compactTitle && pos.length > 0 && <div className="text-xs text-muted">PO {pos.slice(0, 3).join(' · ')}{pos.length > 3 ? ` · +${pos.length - 3} more` : ''} {line.FrtSrc && <Pill tone={line.FrtSrc === 'ACTUAL' ? 'good' : 'neutral'}>{line.FrtSrc}</Pill>}</div>}

      {(line as FreightTagged).FrtIncluded && <p className="rounded-lg border border-line bg-sunken/40 px-3 py-2 text-xs text-muted">This line is priced on {sourceLabel(line.SelSource)}, which already includes freight: the freight below is shown for information and is not added to the cost.</p>}
      {line.FrtSrc && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-sunken/40 px-3 py-2"><div className="text-2xs font-semibold uppercase tracking-wide text-muted">Freight / pc on the cost line</div><div className="num text-lg font-bold">{fmtRate(String(componentFreightLoc(line)))} <span className="text-xs font-normal text-muted">{line.LocCurr}</span></div></div>
          <div className="rounded-xl border border-line bg-sunken/40 px-3 py-2"><div className="text-2xs font-semibold uppercase tracking-wide text-muted">Freight / pc INR</div><div className="num text-lg font-bold">{fmtRate(String(componentFreightInr(line)))}</div></div>
          {st.status === 'ready' && all.length > 0 && <div className="col-span-2 rounded-xl border border-line bg-sunken/40 px-3 py-2 sm:col-span-1"><div className="text-2xs font-semibold uppercase tracking-wide text-muted">Break-up total / pc</div><div className="num text-lg font-bold">{fmtRate(totals.pcLoc)} <span className="text-xs font-normal text-muted">{rows.find((r) => r.Localcurrency)?.Localcurrency}</span></div></div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Freight columns" className="inline-flex rounded-lg border border-line p-0.5">
          {(['ACTUAL', 'STANDARD'] as FreightView[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
              className={cx('rounded-md px-3 py-1 text-xs font-semibold', view === v ? 'bg-accent text-white' : 'text-muted hover:text-ink')}>{v === 'ACTUAL' ? 'Actual' : 'Standard'}</button>
          ))}
        </div>
        <span className="text-xs text-faint">columns only · the cost line is unchanged</span>
        {hidden > 0 && (
          <button type="button" className="ml-auto text-xs font-semibold text-accent hover:underline" onClick={() => setShowAll((x) => !x)}>
            {showAll ? 'Show only the freight used' : `Show all rows (${hidden} more, not used)`}
          </button>
        )}
      </div>

      {st.status === 'loading' || st.status === 'idle' ? (
        <p className="py-4 text-muted">Loading freight rows from SAP…</p>
      ) : st.status === 'error' ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/[0.06] px-3 py-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
          <span className="min-w-0 flex-1 break-words">{st.error}</span>
          <button type="button" className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline" onClick={st.retry}><RefreshCw size={13} /> Retry</button>
        </div>
      ) : !all.length ? (
        <p className="py-4 text-muted">No freight rows found in SAP for this component in plant {werks}.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full">
              <thead className="bg-sunken/60">
                <tr><th className={th}>Condition type</th><th className={thN}>Quantity</th><th className={thN}>Amount</th><th className={thN}>Rate / unit</th><th className={thN}>Standard rate</th><th className={thN}>Per piece (local)</th><th className={thN}>Per piece INR</th></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const isUsed = usedSet.has(l.row) && !l.zero;
                  return (
                    <tr key={i} className={cx('border-t border-line/60', isUsed ? 'font-bold' : 'text-faint')}>
                      <td className={td}><span className="font-mono">{l.row.Conditiontype || '—'}</span>{l.row.UsedSrc && <span className="ml-1 text-2xs font-normal text-faint">{l.row.UsedSrc}</span>}</td>
                      <td className={tdN}>{fmtQty(l.qty)} <span className="text-2xs font-normal text-faint">{l.row.Matuom || l.row.Baseunit}</span></td>
                      <td className={tdN}>{fmtNum(l.amount, 2, l.row.Currency)} <span className="text-2xs font-normal text-faint">{l.row.Currency}</span></td>
                      <td className={tdN}>{fmtRate(l.rate)}</td>
                      <td className={tdN}>{fmtRate(l.stdRate)}</td>
                      <td className={tdN}>{fmtRate(l.pcLoc)} <span className="text-2xs font-normal text-faint">{l.row.Localcurrency}</span></td>
                      <td className={tdN}>{fmtRate(l.pcInr)}</td>
                    </tr>
                  );
                })}
                {lines.length > 1 && (
                  <tr className="border-t-2 border-line bg-sunken/60 font-bold">
                    <td className={td}>Total</td>
                    <td className={tdN}>{fmtQty(totals.qty)}</td>
                    <td className={tdN}>{fmtNum(totals.amount, 2)}</td>
                    <td className={tdN} /><td className={tdN} />
                    <td className={tdN}>{fmtRate(totals.pcLoc)}</td>
                    <td className={tdN}>{fmtRate(totals.pcInr)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rec && (rec.matches ? (
            <p className="flex items-center gap-1.5 font-semibold text-good"><CheckCircle2 size={16} /> Matches the cost line ({fmtRate(rec.breakup)} vs {fmtRate(rec.line)} {line.LocCurr} per piece).</p>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
              <span>The break-up uses the material base unit and the plant currency; the cost line uses unit {line.Meins || '—'} and currency {line.LocCurr || '—'}.
                {' '}Break-up {fmtRate(rec.breakup)} {rec.rowCurr}{rec.rowUnit ? ` / ${rec.rowUnit}` : ''} · cost line {fmtRate(rec.line)} {line.LocCurr} / {line.Meins}.</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Centred dialog with a dimmed background; Escape, the backdrop or ✕ close it (and abort a running request). */
export default function FreightBreakupDialog({ line, run, onClose }: { line: CostLine; run: FreightRun; anchor?: DOMRect | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-3 backdrop-blur-[1px] sm:p-6" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Freight break-up ${line.Idnrk}`}
        className="relative max-h-[calc(100vh-24px)] w-[min(920px,100%)] overflow-auto rounded-2xl border border-line bg-panel p-5 shadow-2xl outline-none sm:max-h-[calc(100vh-48px)]"
        onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Close freight break-up" onClick={onClose} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-ink"><X size={18} /></button>
        <FreightBreakupPanel line={line} run={run} />
      </div>
    </div>,
    document.body,
  );
}
