'use client';
/**
 * "Rate coverage" tab (BOM costing and plan breakup): per source how many components have a rate and the share
 * of leaf rows that use it; the "MBEW only" list (SrcCount 1 and SelSource MBEW) with one-click "Add donor
 * plant..." / "Look-back 730"; and lines where SAP found a source outside the priority. Loads the rate options
 * lazily (first open); everything that needs no options shows straight away.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import { isLeafRow } from '@/lib/cost/tree';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { MBEW_ONLY_HINT, rateCoverage } from '@/lib/rates/coverage';
import { ratesIntegrity } from '@/lib/rates/integrity';
import { prioLabel } from '@/lib/rates/priority';
import { fmtRate } from '@/lib/format';
import { Button, Card, Pill, SourceBadge, cx, sourceColorVar } from '../ui';
import IntegrityBanner from './IntegrityBanner';

export default function RateCoverage({ lines, rates, prio, lookback, onAddDonor, onLookback, onOpenRow }: {
  lines: CostLine[]; rates: RatesState; prio: string[]; lookback: number;
  onAddDonor?: () => void; onLookback?: (days: number) => void; onOpenRow?: (i: number) => void;
}) {
  const { request } = rates;
  useEffect(() => { request(); }, [request]);
  const ready = rates.status === 'ready';
  const cov = useMemo(() => rateCoverage(lines, prio, ready), [lines, prio, ready]);
  const integrity = useMemo(() => (ready ? ratesIntegrity(lines.filter(isLeafRow)) : null), [lines, ready]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const maxShare = Math.max(0.0001, ...cov.sources.map((s) => s.share));

  return (
    <div className="scroll-thin flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Priority: <b className="text-ink">{prioLabel(prio)}</b></span>
        <span>· Look-back {lookback} days</span>
        <span>· {cov.leafRows.toLocaleString('en-IN')} leaf rows</span>
        {cov.donorRows > 0 && <Pill tone="warn">{cov.donorRows} row{cov.donorRows === 1 ? '' : 's'} from donor plant {cov.donorPlants.join(', ')}</Pill>}
        <span className="ml-auto">{rates.status === 'loading' || rates.status === 'idle' ? 'Loading rate options…' : rates.status === 'ready' ? `Rate options from ${rates.mode === 'direct' ? 'RateOptionSet' : '$expand'}` : rates.status === 'unavailable' || rates.status === 'error' ? <>{rates.note} <button type="button" className="font-semibold text-accent underline" onClick={rates.retest}>Test again</button></> : null}</span>
      </div>
      <IntegrityBanner integrity={integrity} />

      <Card title="Coverage by source">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {cov.sources.map((s) => (
            <div key={s.source} className="rounded-xl border border-line px-3 py-2" style={{ borderLeft: `4px solid ${sourceColorVar(s.source)}` }}>
              <SourceBadge source={s.source} />
              <div className="mt-1.5 text-xs text-muted">Components with a rate</div>
              <div className="num text-lg font-extrabold">{ready ? s.components.toLocaleString('en-IN') : '…'}</div>
              <div className="mt-1 text-xs text-muted">Leaf rows using it</div>
              <div className="flex items-center gap-2">
                <span className="num text-sm font-bold">{(s.share * 100).toFixed(1)}%</span>
                <span className="text-2xs text-faint">({s.usedLeaf})</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full" style={{ width: `${(s.share / maxShare) * 100}%`, background: sourceColorVar(s.source) }} /></span>
              </div>
              {!prio.includes(s.source) && <div className="mt-1 text-2xs text-faint">not in priority</div>}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={<span className="flex items-center gap-2">C-MAP only <Pill tone={cov.mbewOnly.length ? 'warn' : 'good'}>{cov.mbewOnly.length} component{cov.mbewOnly.length === 1 ? '' : 's'}</Pill></span>}
        actions={cov.mbewOnly.length ? (
          <>
            {onAddDonor && <Button size="sm" onClick={onAddDonor}>Add donor plant…</Button>}
            {onLookback && <Button size="sm" disabled={lookback >= 730} onClick={() => onLookback(730)}>Look-back 730</Button>}
          </>
        ) : undefined}
      >
        {cov.mbewOnly.length ? (
          <>
            <p className="mb-2 flex items-start gap-1.5 text-xs text-muted"><Info size={13} className="mt-px shrink-0" /> {MBEW_ONLY_HINT}</p>
            <ul className="divide-y divide-line/60 text-xs">
              {cov.mbewOnly.map((g) => {
                const isOpen = open.has(g.idnrk);
                return (
                  <li key={g.idnrk} className="py-1.5">
                    <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={isOpen} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(g.idnrk)) n.delete(g.idnrk); else n.add(g.idnrk); return n; })}>
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span className="font-mono font-semibold">{g.idnrk}</span>
                      <span className="min-w-0 truncate text-muted">{g.maktx}</span>
                      <span className="ml-auto shrink-0 text-faint">{g.rows.length} row{g.rows.length === 1 ? '' : 's'}</span>
                    </button>
                    {isOpen && (
                      <ul className="ml-6 mt-1 space-y-0.5">
                        {g.rows.map((r) => (
                          <li key={r.idx}><button type="button" className="text-left hover:text-accent hover:underline" onClick={() => onOpenRow?.(r.idx)}>{r.headmat} · plant {r.hwerks}{r.werks !== r.hwerks ? ` (component plant ${r.werks})` : ''}</button></li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : <p className="text-xs text-muted">Every leaf row has a rate from at least one source besides C-MAP (or more than one source).</p>}
      </Card>

      <Card title={<span className="flex items-center gap-2">Source outside priority {ready && <Pill tone={cov.outsidePrio.length ? 'accent' : 'good'}>{cov.outsidePrio.length}</Pill>}</span>}>
        {!ready ? <p className="text-xs text-muted">Needs the rate options (loading on this tab).</p> : !cov.outsidePrio.length ? (
          <p className="text-xs text-muted">No line has a rate from a source that is not in the priority.</p>
        ) : (
          <div className="scroll-thin max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel text-[11px] font-bold uppercase tracking-wide text-faint">
                <tr><th className="px-2 py-1 text-left">Component</th><th className="px-2 py-1 text-left">Header · plant</th><th className="px-2 py-1 text-left">Used</th><th className="px-2 py-1 text-right">Sources found</th><th className="px-2 py-1 text-left">Not in priority (rate / pc INR)</th></tr>
              </thead>
              <tbody>
                {cov.outsidePrio.map((o) => (
                  <tr key={o.idx} className="cursor-pointer border-t border-line/50 hover:bg-sunken" onClick={() => onOpenRow?.(o.idx)}>
                    <td className="px-2 py-1"><span className="font-mono font-semibold">{o.line.Idnrk}</span> <span className="text-muted">{o.line.Maktx}</span></td>
                    <td className="px-2 py-1">{o.line.Headmat} · {o.line.Hwerks}</td>
                    <td className="px-2 py-1"><SourceBadge source={o.line.SelSource} /></td>
                    <td className="num px-2 py-1 text-right">{o.line.SrcCount}</td>
                    <td className="px-2 py-1"><span className="flex flex-wrap gap-1.5">{o.unused.map((u) => <span key={u.source} className={cx('inline-flex items-center gap-1')}><SourceBadge source={u.source} /> <span className="num">{fmtRate(u.ratePcInr)}</span></span>)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
