'use client';
/**
 * "Why no rate?": the NORATE flag says SAP found no valid ZBAS rate on the scenario's key date. This reads the material's own rate records
 * (BudRateSrcDtlSet) and sets their validity against the key date, so the reason is visible: no record at all, a record that starts after or ended
 * before the key date, or a plant (HO00) with no stock to fall back on. Nothing is changed in the scenario.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, Spinner, cx } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchRateSrcDtl } from '@/lib/budgetMgmt/api';
import type { BudRateSrcDtlRow } from '@/lib/budgetMgmt/types';
import { showDate as showYmd } from '@/lib/budgetMgmt/rules';
import { showDate, stripZeros, windowVerdict } from '@/lib/pkg/rules';
import { fmtNum } from '@/lib/format';
import type { PkgScen } from '@/lib/pkg/types';

type Ask = (matnr: string, descr: string) => void;
const Ctx = createContext<Ask | null>(null);
export const useNoRateWhy = () => useContext(Ctx);

export function NoRateWhyProvider({ scen, children }: { scen: PkgScen | null; children: ReactNode }) {
  const [ask, setAsk] = useState<{ matnr: string; descr: string } | null>(null);
  return (
    <Ctx.Provider value={scen ? (matnr, descr) => setAsk({ matnr, descr }) : null}>
      {children}
      {ask && scen && <WhyDialog scen={scen} matnr={ask.matnr} descr={ask.descr} onClose={() => setAsk(null)} />}
    </Ctx.Provider>
  );
}

function WhyDialog({ scen, matnr, descr, onClose }: { scen: PkgScen; matnr: string; descr: string; onClose: () => void }) {
  const [rows, setRows] = useState<BudRateSrcDtlRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    // Plant HO00 and the Indian plants price from India's company code 1000.
    fetchRateSrcDtl(matnr, '1000', 'IN').then((r) => live && setRows(r), (x) => live && setError(errorText(x)));
    return () => { live = false; };
  }, [matnr]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const zbas = (rows ?? []).filter((r) => r.RateSrc === 'INFO' || r.RateSrc === 'CONT');
  const valid = zbas.filter((r) => windowVerdict(r, scen.KeyDate).ok);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Why no rate">
      <div className="absolute inset-0 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-panel shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0"><p className="text-sm font-bold">Why no rate — <span className="font-mono">{stripZeros(matnr)}</span> {descr}</p>
            <p className="text-xs text-muted">Scenario key date {showDate(scen.KeyDate)} · plant {scen.Werks || 'all'} · rate priority {scen.Prio || '—'}</p></div>
          <Button size="sm" onClick={onClose}><X size={13} /> Close</Button>
        </div>
        <div className="overflow-auto p-4 text-sm">
          {!rows && !error && <div className="flex items-center gap-2 py-8 text-muted"><Spinner /> Reading the rate records…</div>}
          {error && <ErrorBox>{error}</ErrorBox>}
          {rows && (
            <div className="flex flex-col gap-3">
              <p className={cx('rounded-lg border px-3 py-2 text-xs', valid.length ? 'border-good/40 bg-good/10' : 'border-warn/40 bg-warn/10')}>
                {!zbas.length
                  ? <>This material has <b>no Info record or Contract rate (ZBAS)</b> at all, so SAP has nothing to take on {showDate(scen.KeyDate)}. A rate has to be maintained in SAP (or the basic rate set here).</>
                  : valid.length
                    ? <>A ZBAS record is valid on the key date here, so SAP&apos;s NORATE came from something else (for example a unit or currency problem): check it in SAP.</>
                    : <>The material has ZBAS records, but <b>none is valid on the key date {showDate(scen.KeyDate)}</b>: that is why SAP says NORATE. Each record&apos;s own validity is below. Fix: a key date inside a validity window, or SAP&apos;s rule extended to take the nearest valid record.</>}
              </p>
              {zbas.length > 0 && (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-faint"><th className="px-2 py-1">Source</th><th className="px-2 py-1">Cond</th><th className="px-2 py-1">Vendor</th><th className="px-2 py-1 text-right">Rate</th><th className="px-2 py-1">Per</th><th className="px-2 py-1">Valid</th><th className="px-2 py-1">Against the key date</th></tr></thead>
                  <tbody>{zbas.map((r, i) => { const v = windowVerdict(r, scen.KeyDate); return (
                    <tr key={i} className="border-t border-line/60"><td className="px-2 py-1">{r.RateSrc === 'INFO' ? 'Info record' : 'Contract'}</td><td className="px-2 py-1">{r.CondType}</td><td className="px-2 py-1">{r.Vendor ? `${r.Vendor} ${r.Vendname}` : '—'}</td>
                      <td className="num px-2 py-1 text-right">{fmtNum(r.Rate, 2)} {r.Currency}</td><td className="num px-2 py-1">{r.PriceUnit} {r.CondUnit}</td><td className="px-2 py-1">{showYmd(r.ValidFrom)} – {showYmd(r.ValidTo)}</td>
                      <td className={cx('px-2 py-1 font-semibold', v.ok ? 'text-good' : 'text-bad')}>{v.text}</td></tr>); })}</tbody>
                </table>
              )}
              {rows.filter((r) => r.RateSrc === 'BASE').map((r, i) => <p key={i} className="text-xs text-muted">Weighted average base price in the last year: <b className="num">{fmtNum(r.RatePc, 4)}</b> per piece — SAP does not use it for this scenario.</p>)}
              <p className="text-xs text-muted">{scen.Werks === 'HO00' ? 'Plant HO00 (head office) holds no packing-material stock, so the Consumption and C-MAP fallbacks in the rate priority have nothing to offer either.' : ''}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
