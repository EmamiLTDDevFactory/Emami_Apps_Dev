'use client';
/**
 * Freight breakup (FrtDtlSet): every freight condition type of a material in a country over the history window, with the freight total (the SUM of all
 * of them) and the landed rate (final basic rate + freight total).
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner, cx } from '../ui';
import { ErrorBox, NO_RECORDS, errorText, td, th } from './shared';
import { fetchFrtDtl } from '@/lib/budgetMgmt/api';
import type { FrtDtlRow } from '@/lib/budgetMgmt/types';
import { frtBreakup, showDate, stripZeros } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

const Stat = ({ k, v, sub, strong }: { k: string; v: string; sub?: string; strong?: boolean }) => (
  <div className="rounded-xl border border-line bg-panel px-3 py-2"><p className="text-2xs text-muted">{k}</p><p className={cx('num text-lg', strong && 'font-extrabold text-accent')}>{v}</p>{sub && <p className="text-2xs text-muted">{sub}</p>}</div>
);

export default function FreightBreakup({ matnr, land1, histFrom, histTo, finalBasic, title, onClose }: { matnr: string; land1: string; histFrom: string; histTo: string; finalBasic: number | null; title: string; onClose: () => void }) {
  const [rows, setRows] = useState<FrtDtlRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setRows(null); setError('');
    fetchFrtDtl(matnr, land1, histFrom, histTo).then((r) => live && setRows(r), (x) => live && setError(errorText(x)));
    return () => { live = false; };
  }, [matnr, land1, histFrom, histTo]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const b = useMemo(() => (rows ? frtBreakup(rows, finalBasic) : null), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = b?.currency || 'INR';
  // When no amount property was recognised, every property SAP sent is shown so the right one can be named.
  const rawCols = useMemo(() => (rows && b && b.unread > 0 ? Array.from(new Set(rows.flatMap((r) => Object.keys(r.raw)))) : []), [rows, b]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Freight breakup">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div><p className="text-sm font-bold">Freight breakup — {stripZeros(matnr)}</p><p className="text-xs text-muted">{title} · country {land1} · history {showDate(histFrom.replace(/-/g, ''))} – {showDate(histTo.replace(/-/g, ''))}</p></div>
          <Button size="sm" onClick={onClose}><X size={13} /> Close</Button>
        </div>
        <div className="overflow-auto p-4">
          {!rows && !error && <div className="flex items-center gap-2 py-10 text-sm text-muted"><Spinner /> Reading the freight conditions…</div>}
          {error && <ErrorBox>{error}</ErrorBox>}
          {rows && b && rows.length === 0 && <p className="py-8 text-center text-sm text-muted">{NO_RECORDS}</p>}
          {rows && b && rows.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat k={`Freight total (${cur})`} v={fmtNum(b.total, 3)} sub={`sum of ${rows.length} condition type${rows.length === 1 ? '' : 's'}`} strong />
                <Stat k="Final basic rate" v={finalBasic === null ? '—' : fmtNum(finalBasic, 3)} sub={finalBasic === null ? 'no derived rate yet' : 'derived rate of the material'} />
                <Stat k="Landed rate" v={b.landed === null ? '—' : fmtNum(b.landed, 3)} sub={b.landed === null ? undefined : `${fmtNum(finalBasic as number, 3)} + ${fmtNum(b.total, 3)}`} />
              </div>
              <p className="text-xs text-muted">Freight total = the sum of all freight condition types. Landed rate = final basic rate + freight total, however many condition types there are.</p>
              {b.unread > 0 && <ErrorBox>{b.unread} row{b.unread === 1 ? '' : 's'} sent no amount property the app knows (FrtTotal, FreightTotal, FrtAmt, FrtRate, FrtValue, Amount, Rate, Kwert, Value), so the total above leaves {b.unread === 1 ? 'it' : 'them'} out. All properties SAP sent are listed below; tell me which one is the freight amount.</ErrorBox>}
              <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-sunken">
                    {rawCols.length > 0
                      ? <tr>{rawCols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
                      : <tr><th className={th}>Cond type</th><th className={th}>Description</th><th className={th}>Vendor</th><th className={cx(th, 'text-right')}>Amount</th><th className={th}>Curr</th><th className={cx(th, 'text-right')}>Share</th></tr>}
                  </thead>
                  <tbody>
                    {b.lines.map((l, i) => rawCols.length > 0
                      ? <tr key={i} className="border-b border-line/60">{rawCols.map((c) => <td key={c} className={td}>{l.raw[c] ?? ''}</td>)}</tr>
                      : <tr key={i} className="border-b border-line/60"><td className={cx(td, 'num')}>{l.cond || '—'}</td><td className={td}>{l.text || '—'}</td><td className={td}>{l.vendor || '—'}</td><td className={cx(td, 'num text-right')}>{fmtNum(l.amount ?? 0, 3)}</td><td className={td}>{l.curr}</td><td className={cx(td, 'num text-right')}>{fmtNum(l.share * 100, 1)}%</td></tr>)}
                  </tbody>
                  {rawCols.length === 0 && <tfoot className="sticky bottom-0 bg-sunken font-extrabold"><tr><td className={td} colSpan={3}>Freight total</td><td className={cx(td, 'num text-right text-accent')}>{fmtNum(b.total, 3)}</td><td className={td}>{cur}</td><td className={cx(td, 'num text-right')}>100%</td></tr></tfoot>}
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
