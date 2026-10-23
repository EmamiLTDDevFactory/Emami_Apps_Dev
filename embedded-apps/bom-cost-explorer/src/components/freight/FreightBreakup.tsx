'use client';
/**
 * Freight break-up of one cost line by condition type (lib/freight/breakup.ts). Loaded with next/dynamic only when
 * a freight value is clicked or the drawer section is opened, so with the flag off none of this code is loaded.
 *   FreightBreakupPanel    the content (also used inside the row drawer)
 *   default (popover)      desktop: popover next to the clicked value; mobile (< 640 px): bottom sheet
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { Pill, cx } from '../ui';
import type { CostLine } from '@/lib/sap/fields';
import { breakupLines, freightKeyOf, poSummary, reconcile, type FreightRun, type FreightView } from '@/lib/freight/breakup';
import { useFreightBreakup } from '@/lib/freight/useFreightBreakup';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';

const th = 'px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2 py-1 align-top';
const tdN = `${td} num text-right whitespace-nowrap`;

export function FreightBreakupPanel({ line, run, enabled = true, compactTitle = false }: { line: CostLine; run: FreightRun; enabled?: boolean; compactTitle?: boolean }) {
  const st = useFreightBreakup(freightKeyOf(line, run), enabled);
  const [view, setView] = useState<FreightView>(line.FrtSrc === 'STANDARD' ? 'STANDARD' : 'ACTUAL');
  const werks = line.Werks || line.Hwerks;
  const rows = st.status === 'ready' ? st.rows : [];
  const { lines, totals } = breakupLines(rows, view);
  const rec = st.status === 'ready' && rows.length ? reconcile(rows, line) : null;
  const pos = poSummary(rows);

  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs">
      {!compactTitle && (
        <div>
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <span className="font-mono text-sm font-semibold">{line.Idnrk}</span>
            <span className="text-sm">{line.Maktx}</span>
            <span className="text-muted">- plant {werks}</span>
            {line.FrtSrc && <Pill tone={line.FrtSrc === 'ACTUAL' ? 'good' : 'neutral'} title="Freight source the costing used">{line.FrtSrc}</Pill>}
          </div>
          {pos.length > 0 && <div className="mt-0.5 text-2xs text-muted">PO {pos.slice(0, 3).join(' · ')}{pos.length > 3 ? ` · +${pos.length - 3} more` : ''}</div>}
        </div>
      )}
      {compactTitle && pos.length > 0 && <div className="text-2xs text-muted">PO {pos.slice(0, 3).join(' · ')}{pos.length > 3 ? ` · +${pos.length - 3} more` : ''} {line.FrtSrc && <Pill tone={line.FrtSrc === 'ACTUAL' ? 'good' : 'neutral'}>{line.FrtSrc}</Pill>}</div>}

      <div className="flex items-center gap-2">
        <div role="radiogroup" aria-label="Freight columns" className="inline-flex rounded-lg border border-line p-0.5">
          {(['ACTUAL', 'STANDARD'] as FreightView[]).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
              className={cx('rounded-md px-2 py-0.5 text-2xs font-semibold', view === v ? 'bg-accent text-white' : 'text-muted hover:text-ink')}>{v === 'ACTUAL' ? 'Actual' : 'Standard'}</button>
          ))}
        </div>
        <span className="text-2xs text-faint">columns only · the cost line is unchanged</span>
      </div>

      {st.status === 'loading' || st.status === 'idle' ? (
        <p className="py-3 text-muted">Loading freight rows from SAP…</p>
      ) : st.status === 'error' ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/[0.06] px-2.5 py-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-bad" />
          <span className="min-w-0 flex-1 break-words">{st.error}</span>
          <button type="button" className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline" onClick={st.retry}><RefreshCw size={12} /> Retry</button>
        </div>
      ) : !rows.length ? (
        <p className="py-3 text-muted">No freight rows found in SAP for this component in plant {werks}.</p>
      ) : (
        <>
          <div className="scroll-thin max-h-[50vh] overflow-auto rounded-lg border border-line">
            <table className="w-full">
              <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]">
                <tr><th className={th}>Condition type</th><th className={thN}>Quantity</th><th className={thN}>Amount</th><th className={thN}>Rate / unit</th><th className={thN}>Standard rate</th><th className={thN}>Per piece (local)</th><th className={thN}>Per piece INR</th></tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={cx('border-t border-line/60', l.zero && 'text-faint')}>
                    <td className={td}><span className="font-mono font-semibold">{l.row.Conditiontype || '—'}</span>{l.row.UsedSrc && <span className="ml-1 text-2xs text-faint">{l.row.UsedSrc}</span>}</td>
                    <td className={tdN}>{fmtQty(l.qty)} <span className="text-2xs text-faint">{l.row.Matuom || l.row.Baseunit}</span></td>
                    <td className={tdN}>{fmtNum(l.amount, 2, l.row.Currency)} <span className="text-2xs text-faint">{l.row.Currency}</span></td>
                    <td className={tdN}>{fmtRate(l.rate)}</td>
                    <td className={tdN}>{fmtRate(l.stdRate)}</td>
                    <td className={tdN}>{fmtRate(l.pcLoc)} <span className="text-2xs text-faint">{l.row.Localcurrency}</span></td>
                    <td className={tdN}>{fmtRate(l.pcInr)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-sunken/60 font-bold">
                  <td className={td}>Total</td>
                  <td className={tdN}>{fmtQty(totals.qty)}</td>
                  <td className={tdN}>{fmtNum(totals.amount, 2)}</td>
                  <td className={tdN} /><td className={tdN} />
                  <td className={tdN}>{fmtRate(totals.pcLoc)}</td>
                  <td className={tdN}>{fmtRate(totals.pcInr)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {rec && (rec.matches ? (
            <p className="flex items-center gap-1.5 text-good"><CheckCircle2 size={14} /> Matches the cost line ({fmtRate(rec.breakup)} vs {fmtRate(rec.line)} {line.LocCurr} per piece).</p>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-2.5 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
              <span>The break-up uses the material base unit and the plant currency; the cost line uses unit {line.Meins || '—'} and currency {line.LocCurr || '—'}.
                {' '}Break-up {fmtRate(rec.breakup)} {rec.rowCurr}{rec.rowUnit ? ` / ${rec.rowUnit}` : ''} · cost line {fmtRate(rec.line)} {line.LocCurr} / {line.Meins}.</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Popover (desktop) / bottom sheet (mobile) around the panel; unmounting aborts a running request. */
export default function FreightBreakupPopover({ line, run, anchor, onClose }: { line: CostLine; run: FreightRun; anchor: DOMRect | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => { setMobile(window.matchMedia('(max-width: 639px)').matches); }, []);
  useLayoutEffect(() => {
    if (mobile || !anchor || !ref.current) return;
    const w = ref.current.offsetWidth; const h = ref.current.offsetHeight;
    const left = Math.max(8, Math.min(anchor.right - w, window.innerWidth - w - 8));
    const below = anchor.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below;
    setPos({ top, left });
  }, [anchor, mobile]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', key);
    const t = setTimeout(() => window.addEventListener('mousedown', down), 0);
    ref.current?.focus();
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down); clearTimeout(t); };
  }, [onClose]);
  const body = (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={`Freight break-up ${line.Idnrk}`}
      className={cx('z-[60] border border-line bg-panel p-3 shadow-2xl outline-none',
        mobile ? 'fixed inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-2xl' : 'fixed w-[min(760px,calc(100vw-16px))] rounded-xl')}
      style={mobile ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Close freight break-up" onClick={onClose} className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-sunken hover:text-ink"><X size={14} /></button>
      <FreightBreakupPanel line={line} run={run} />
    </div>
  );
  return createPortal(<>{mobile && <div className="fixed inset-0 z-[59] bg-black/30" onClick={onClose} />}{body}</>, document.body);
}
