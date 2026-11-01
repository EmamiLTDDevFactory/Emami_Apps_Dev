'use client';
/** Alerts as SAP sent them, largest impact first. Severity and impact direction are words with an icon, never colour alone. */
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, Info, Minus } from 'lucide-react';
import { BASE_PATH } from '@/lib/client/session';
import { fmtNum } from '@/lib/format';
import { dec } from '@/lib/wac/view';
import { IMPACT_WORD, SEVERITY_WORD, alertKey, boardLink, impactDirection, isComponentScope, scopeText } from '@/lib/margin/alertView';
import type { MarginAlert, Severity } from '@/lib/margin/types';
import { cx } from '../../ui';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted whitespace-nowrap';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
const SEV_STYLE: Record<Severity, string> = { H: 'bg-bad/15 text-bad', M: 'bg-warn/15 text-warn', L: 'bg-sunken text-muted', '': 'bg-sunken text-faint' };
const SEV_ICON = { H: AlertOctagon, M: AlertTriangle, L: Info, '': Info } as const;

export const SeverityBadge = ({ s }: { s: Severity }) => {
  const Icon = SEV_ICON[s];
  return <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-2xs font-semibold', SEV_STYLE[s])}><Icon size={12} aria-hidden />{SEVERITY_WORD[s]}</span>;
};

function Impact({ v }: { v: string }) {
  const d = impactDirection(v);
  if (d === 'na') return NA;
  const Icon = d === 'loss' ? ArrowUpRight : d === 'saving' ? ArrowDownRight : Minus;
  return <span className={d === 'loss' ? 'text-bad' : d === 'saving' ? 'text-good' : 'text-muted'}><Icon size={13} className="mr-1 inline align-[-2px]" aria-hidden /><b>{IMPACT_WORD[d]}</b> {fmtNum(dec(v)!.abs(), 0, 'INR')} <span className="text-2xs text-muted">INR</span></span>;
}
const val = (v: string) => (dec(v) === null ? NA : fmtNum(v, 2, 'X'));

export default function AlertsTable({ rows }: { rows: MarginAlert[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-sunken"><tr><th className={th}>Severity</th><th className={th}>Rule</th><th className={th}>Scope</th><th className={th}>Plant</th><th className={th}>Market / channel</th><th className={th}>What happened</th><th className={thN}>Value</th><th className={thN}>Threshold</th><th className={th}>Impact (annual)</th><th className={th}>Board</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const link = boardLink(r, BASE_PATH);
            return (
              <tr key={alertKey(r, i)} className="border-t border-line/60">
                <td className={td}><SeverityBadge s={r.Severity} /></td>
                <td className={cx(td, 'font-mono font-bold')}>{r.Rule || NA}</td>
                <td className={td}>
                  {isComponentScope(r) ? <><span className="rounded bg-sunken px-1 text-2xs font-bold uppercase text-muted">Component</span> <span className="font-mono font-bold">{r.Comp || 'n/a'}</span><span className="block text-2xs text-muted">{r.FgCnt} finished good{r.FgCnt === 1 ? '' : 's'} affected</span></>
                    : <><span className="font-mono font-bold">{r.Matnr}</span> <span className="text-muted">{r.Maktx}</span></>}
                  <span className="sr-only">{scopeText(r)}</span>
                </td>
                <td className={td}>{r.Werks || NA}</td><td className={td}>{[r.Market, r.Channel].filter(Boolean).join(' / ') || NA}</td>
                <td className={cx(td, 'min-w-[16rem]')}>{r.Text || NA}</td><td className={tdN}>{val(r.Value)}</td><td className={tdN}>{val(r.Threshold)}</td>
                <td className={`${td} whitespace-nowrap`}><Impact v={r.ImpactInr} /></td>
                <td className={td}>{link ? <a href={link} className="inline-flex items-center gap-1 text-xs font-semibold text-accent underline" aria-label={`Open the board for ${r.Matnr} in plant ${r.Werks}`}><ExternalLink size={12} aria-hidden /> Open board</a> : <span className="text-2xs text-faint" title="One component affects several finished goods">several finished goods</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
