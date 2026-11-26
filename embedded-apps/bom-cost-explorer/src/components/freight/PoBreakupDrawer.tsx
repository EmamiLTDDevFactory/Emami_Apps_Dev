'use client';
/**
 * PO-line breakup drawer of the Freight analysis: every posting of one PO line (lib/freight/poBreakup.ts) with the actual / standard
 * subtotals and the variance. Loaded with next/dynamic only when NEXT_PUBLIC_FREIGHT_ALL_ITEMS is on. Works on the rows already
 * loaded, so opening it adds no SAP request.
 */
import { useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button, Drawer, Pill, Stat, cx } from '../ui';
import type { FreightRow } from '@/lib/sap/fields';
import { exportTable } from '@/lib/client/export';
import { fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { breakupSheet, poLineBreakup, type PoLineKey } from '@/lib/freight/poBreakup';

const th = 'px-3 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-3 py-2 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const inr = (v: Parameters<typeof fmtNum>[0]) => fmtNum(v, 4, 'INR');

export default function PoBreakupDrawer({ rows, target, text, onClose }: { rows: FreightRow[]; target: PoLineKey | null; text: string; onClose: () => void }) {
  const b = useMemo(() => (target ? poLineBreakup(rows, target) : null), [rows, target]);
  const doExport = (fmt: 'xlsx' | 'csv') => {
    if (!b || !target) return;
    const sheet = breakupSheet(b);
    void exportTable({
      fmt, name: `Freight PO line ${target.po} ${target.line}`, cols: sheet.cols, count: sheet.count,
      extraParams: [['Report', 'Every posting of one PO line, INR'], ['Plant', target.plant], ['Component', target.material], ['Purchase order', target.po], ['PO line', target.line], ['Postings', String(b.items.length)]],
    });
  };
  const vtone = b?.variance?.gt('0.000001') ? 'bad' : b?.variance?.lt('-0.000001') ? 'good' : undefined;
  return (
    <Drawer open={!!target} onClose={onClose} width={900} trapFocus title={target ? <div><div className="text-base font-bold">PO {target.po} · line {target.line}</div><div className="text-xs text-muted"><span className="font-mono font-bold text-accent">{target.material}</span> {text} · plant {target.plant}{target.cond ? ` · ${target.cond}` : ''}</div></div> : 'PO line breakup'}>
      {b && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Actual / unit" value={b.actual.rate ? inr(b.actual.rate) : '—'} sub={`${b.actual.count} posting(s)`} />
            <Stat label="Standard / unit" value={b.standard.rate ? inr(b.standard.rate) : '—'} sub={`${b.standard.count} posting(s)`} />
            <Stat label="Variance INR / unit" value={b.variance ? fmtSigned(b.variance, 4) : '—'} tone={vtone} />
            <Stat label="Variance %" value={b.variancePct ? fmtPct(b.variancePct) : '—'} tone={vtone} />
            <Stat label="Postings" value={b.items.length} sub={b.unit || undefined} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => doExport('xlsx')} disabled={!b.items.length}><FileSpreadsheet size={14} /> Excel</Button>
            <Button size="sm" variant="ghost" onClick={() => doExport('csv')} disabled={!b.items.length}>CSV</Button>
            <span className="ml-auto text-xs text-faint">All postings of the line, whatever the Basis and Latest only choices. Standard Dr and Actual Cr are minus (quantity and value).</span>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Every posting of the purchase order line, with actual and standard subtotals</caption>
              <thead className="bg-sunken/60">
                <tr><th className={th}>Side</th><th className={th}>Posting type</th><th className={th}>Posting date</th><th className={th}>Document</th><th className={th}>Dr / Cr</th><th className={thN}>Quantity</th><th className={thN}>Amount INR</th><th className={thN}>Freight / unit INR</th><th className={th}>Max date</th><th className={th}>Vendor</th></tr>
              </thead>
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.key} className={cx('border-t border-line/60 border-l-4', i.side === 'actual' ? 'border-l-accent' : 'border-l-warn')}>
                    <td className={cx(td, 'font-semibold')}>{i.side === 'actual' ? 'Actual' : 'Standard'}</td>
                    <td className={td}>{i.typeText}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{i.postingDate || '—'}</td>
                    <td className={cx(td, 'font-mono')}>{i.document || '—'}{i.fiscalYear ? <span className="text-2xs text-muted"> {i.fiscalYear}/{i.item}</span> : null}</td>
                    <td className={td}>{i.drCr || '—'}</td>
                    <td className={tdN}>{fmtNum(i.qty, 3)}</td>
                    <td className={tdN}>{fmtNum(i.amount, 2, 'INR')}</td>
                    <td className={tdN}>{i.rate ? inr(i.rate) : '—'}</td>
                    <td className={td}>{i.isMaxDate ? <Pill tone="accent">Max date</Pill> : ''}</td>
                    <td className={td}>{i.vendor || i.vendorName ? <><span className="font-mono font-bold">{i.vendor}</span> <span className="text-muted">{i.vendorName}</span></> : '—'}</td>
                  </tr>
                ))}
                {!b.items.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No postings were returned for this PO line.</td></tr>}
              </tbody>
              {b.items.length > 0 && (
                <tfoot className="bg-sunken/60 font-bold">
                  <tr className="border-t-2 border-line"><td className={td} colSpan={5}>Actual total</td><td className={tdN}>{fmtNum(b.actual.qty, 3)}</td><td className={tdN}>{fmtNum(b.actual.amount, 2, 'INR')}</td><td className={tdN}>{b.actual.rate ? inr(b.actual.rate) : '—'}</td><td colSpan={2} /></tr>
                  <tr className="border-t border-line"><td className={td} colSpan={5}>Standard total</td><td className={tdN}>{fmtNum(b.standard.qty, 3)}</td><td className={tdN}>{fmtNum(b.standard.amount, 2, 'INR')}</td><td className={tdN}>{b.standard.rate ? inr(b.standard.rate) : '—'}</td><td colSpan={2} /></tr>
                  <tr className="border-t border-line"><td className={td} colSpan={7}>Variance (INR / unit{b.variancePct ? ` · ${fmtPct(b.variancePct)}` : ''})</td><td className={cx(tdN, vtone === 'bad' && 'text-bad', vtone === 'good' && 'text-good')}>{b.variance ? fmtSigned(b.variance, 4) : '—'}</td><td colSpan={2} /></tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}
