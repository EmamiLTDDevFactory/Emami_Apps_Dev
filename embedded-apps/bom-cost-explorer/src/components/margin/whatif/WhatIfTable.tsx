'use client';
/** Result table of the What-if screen: before and after side by side per finished good, as SAP computed them. Text + icon for every direction. */
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { fmtNum } from '@/lib/format';
import { dec } from '@/lib/wac/view';
import { ANNUAL_WORD, REMAIN_WORD, direction, noResult, simKey, withTarget, type Direction } from '@/lib/margin/whatifView';
import type { MarginSim } from '@/lib/margin/types';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted whitespace-nowrap';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const amt = (v: string, dp = 4) => (dec(v) === null ? NA : fmtNum(v, dp, 'X'));

/** Positive annual change = loss (cost up / remaining amount down), negative = saving. */
function Annual({ v }: { v: string }) {
  const d: Direction = direction(v);
  if (d === 'na') return NA;
  const Icon = d === 'up' ? ArrowUpRight : d === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={d === 'up' ? 'text-bad' : d === 'down' ? 'text-good' : 'text-muted'}>
      <Icon size={13} className="mr-1 inline align-[-2px]" aria-hidden /><b>{ANNUAL_WORD[d]}</b> {fmtNum(dec(v)!.abs(), 0, 'INR')} <span className="text-2xs text-muted">INR / year</span>
    </span>
  );
}
function RemainChange({ v, curr }: { v: string; curr: string }) {
  const d = direction(v);
  if (d === 'na') return NA;
  const Icon = d === 'up' ? ArrowUpRight : d === 'down' ? ArrowDownRight : Minus;
  return <span className={d === 'down' ? 'text-bad' : d === 'up' ? 'text-good' : 'text-muted'}><Icon size={13} className="mr-1 inline align-[-2px]" aria-hidden />{d === 'same' ? REMAIN_WORD.same : `${d === 'up' ? '+' : '−'}${fmtNum(dec(v)!.abs(), 4, 'X')}`} <span className="text-2xs text-muted">{curr}</span><span className="block text-2xs">{REMAIN_WORD[d]}</span></span>;
}
const Pair = ({ before, after }: { before: string; after: string }) => <><td className={tdN}>{amt(before)}</td><td className={tdN}>{amt(after)}</td></>;

export default function WhatIfTable({ rows }: { rows: MarginSim[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-sunken">
          <tr>
            <th rowSpan={2} className={th}>Finished good</th><th rowSpan={2} className={th}>Market / channel</th><th rowSpan={2} className={th}>Curr.</th>
            {['MRP', 'Selling price', 'COGM', 'Amount remaining after manufacturing cost', 'Ratio of selling price %'].map((h) => <th key={h} colSpan={2} className={`${th} border-l border-line text-center`}>{h}</th>)}
            <th rowSpan={2} className={`${th} border-l border-line`}>Change of the remaining amount</th><th rowSpan={2} className={th}>Annual change</th>
            <th colSpan={3} className={`${th} border-l border-line text-center`}>Reaching the target</th><th rowSpan={2} className={`${th} border-l border-line`}>Message</th>
          </tr>
          <tr>
            {Array.from({ length: 5 }).flatMap((_, i) => [<th key={`b${i}`} className={`${thN} border-l border-line`}>Before</th>, <th key={`a${i}`} className={thN}>After</th>])}
            <th className={`${thN} border-l border-line`}>Price for target ratio</th><th className={thN}>Price for target remaining</th><th className={thN}>MRP that restores</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={simKey(r, i)} className="border-t border-line/60">
              <td className={td}><span className="font-mono font-bold">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span><span className="block text-2xs text-muted">plant {r.Werks}{r.SellUom ? ` · per ${r.SellUom}` : ''}</span></td>
              <td className={td}>{[r.Market, r.Channel].filter(Boolean).join(' / ') || NA}</td><td className={td}>{r.Curr || NA}</td>
              <Pair before={r.MrpBefore} after={r.MrpAfter} /><Pair before={r.SpBefore} after={r.SpAfter} /><Pair before={r.CogmBefore} after={r.CogmAfter} /><Pair before={r.RemainBefore} after={r.RemainAfter} /><Pair before={r.RatioBefore} after={r.RatioAfter} />
              <td className={`${td} whitespace-nowrap`}><RemainChange v={r.DeltaRemain} curr={r.Curr} /></td>
              <td className={`${td} whitespace-nowrap`}><Annual v={r.AnnualDeltaInr} /></td>
              <td className={tdN}>{amt(r.ReqSpRatio)}</td><td className={tdN}>{amt(r.ReqSpRemain)}</td><td className={tdN}>{amt(r.ReqMrpRestore)}</td>
              <td className={td}>{r.Msg ? <span className="flex items-start gap-1 text-xs text-warn"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{noResult(r) ? 'No result: ' : ''}{r.Msg}</span> : !withTarget(r) ? <span className="text-faint">—</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
