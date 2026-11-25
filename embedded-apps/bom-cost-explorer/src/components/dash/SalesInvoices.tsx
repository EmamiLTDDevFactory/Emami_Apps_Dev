'use client';
/** Sales view: the invoices behind a selection (SAP: DashSalesSet, Grain I): invoice, date, sales organisation, channel, material, quantity, GSV, NSV, COGM. */
import { useEffect, useMemo, useState } from 'react';
import { Drawer, Spinner } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchSalesInvoices, type SalesExtra } from '@/lib/dash/service';
import { invoiceSales, salesViews, type SalesView } from '@/lib/dash/logic';
import { BAND, lakh, money, pct, tdCls, thCls } from './parts';

export interface InvoiceTarget { title: string; plants: string[]; from: string; to: string; extra: SalesExtra }

export default function SalesInvoices({ target, onClose }: { target: InvoiceTarget | null; onClose: () => void }) {
  const [rows, setRows] = useState<SalesView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!target) return;
    const c = new AbortController();
    setBusy(true); setError(''); setRows(null);
    Promise.resolve().then(() => fetchSalesInvoices(target.plants, target.from, target.to, target.extra, c.signal))
      .then((r) => { if (!c.signal.aborted) setRows(invoiceSales(salesViews(r.rows))); })
      .catch((e) => { if (!c.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [target]);
  const tot = useMemo(() => (rows ?? []).reduce((a, r) => ({ nsv: a.nsv + r.nsv.toNumber(), gsv: a.gsv + r.gsv.toNumber(), qty: a.qty + r.soldQty.toNumber() }), { nsv: 0, gsv: 0, qty: 0 }), [rows]);
  return (
    <Drawer open={!!target} onClose={onClose} title={target ? `Invoices: ${target.title}` : ''} width={1180}>
      {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading invoices from SAP</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {rows && (
        <>
          <p className="mb-2 text-xs text-muted">{rows.length.toLocaleString('en-IN')} invoice line(s) · quantity {tot.qty.toLocaleString('en-IN', { maximumFractionDigits: 0 })} pc · GSV ₹{(tot.gsv / 100000).toFixed(3)} L · NSV ₹{(tot.nsv / 100000).toFixed(3)} L. Credit memos and cancellations are negative. SAP returns at most 20,000 lines.</p>
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[1040px] border-collapse">
              <thead className="sticky top-0"><tr>
                <th className={thCls}>Invoice</th><th className={thCls}>Date</th><th className={thCls}>Sales org</th><th className={thCls}>Channel</th><th className={`${thCls} !text-left`}>Material</th>
                <th className={thCls}>Qty (pc)</th><th className={thCls}>GSV (L)</th><th className={thCls}>NSV (L)</th><th className={thCls}>COGM / pc</th><th className={thCls}>COGM (L)</th><th className={thCls}>GM %</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.vbeln}|${r.matnr}|${r.vtweg}|${r.vkorg}|${i}`} className="border-t border-line/60">
                    <td className={`${tdCls} font-bold`}>{r.vbeln.replace(/^0+/, '')}</td><td className={tdCls}>{r.fkdat}</td><td className={tdCls}>{r.vkorg}</td><td className={tdCls}>{r.channel}</td>
                    <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{r.matnr.replace(/^0+/, '')}</span> <span className="text-muted" title={r.maktx}>{r.maktx}</span></td>
                    <td className={tdCls}>{money(r.soldQty, 0)}</td><td className={tdCls}>{lakh(r.gsv, 3)}</td><td className={tdCls}>{lakh(r.nsv, 3)}</td>
                    <td className={tdCls}>{money(r.cogmPc)}</td><td className={tdCls}>{r.cogm.isZero() ? '-' : lakh(r.cogm, 3)}</td><td className={`${tdCls} font-bold ${BAND[r.band]}`}>{pct(r.gmPct)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={11} className="p-3 text-center text-xs text-muted">No invoices for this selection.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Drawer>
  );
}
