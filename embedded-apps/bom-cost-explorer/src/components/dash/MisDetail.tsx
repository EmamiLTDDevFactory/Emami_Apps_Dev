'use client';
/** MIS drill-down: the finished goods behind a brand row (actual, budget, and the budget key SAP matched or could not match). Display only. */
import { Fragment } from 'react';
import Decimal from 'decimal.js';
import { cx } from '../ui';
import type { MisFgRow } from '@/lib/dash/types';
import { BAND, lakh, tdCls, thCls } from './parts';
import { bandOf } from '@/lib/dash/logic';
import { useFgRigid } from '@/lib/rigid/useFgRigid';

const D = (v: string) => { try { return new Decimal(v || 0); } catch { return new Decimal(0); } };
const n4 = (d: Decimal) => d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MisFgTable({ rows, showBrand = false, bn, pn, byProduct = false, onOpen }: { rows: MisFgRow[]; showBrand?: boolean; bn?: (c: string) => string; pn?: (c: string) => string; byProduct?: boolean; onOpen?: (r: MisFgRow) => void }) {
  // additive: the rigid packing column appears only when ZRIGID returns something for these finished goods
  const rg = useFgRigid(rows.map((r) => ({ matnr: r.Matnr, werks: r.Werks })));
  const groups = (() => {
    if (!byProduct) return [{ key: 'all', prodha: '', rows, qty: D('0'), bud: D('0'), act: D('0'), nobud: 0 }];
    const m = new Map<string, { key: string; prodha: string; rows: MisFgRow[]; qty: Decimal; bud: Decimal; act: Decimal; nobud: number }>();
    for (const r of rows) {
      const k = r.Prodha ?? '';
      const g = m.get(k) ?? { key: k || '-', prodha: k, rows: [], qty: D('0'), bud: D('0'), act: D('0'), nobud: 0 };
      g.rows.push(r); g.qty = g.qty.plus(D(r.YtmQty));
      if (r.FgNobud === 0) { g.bud = g.bud.plus(D(r.YtmBudget)); g.act = g.act.plus(D(r.YtmActualCmp)); } else g.nobud += 1;
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => a.prodha.localeCompare(b.prodha));
  })();
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            {showBrand && <th className={cx(thCls, '!text-left')}>Brand</th>}
            <th className={cx(thCls, '!text-left')}>Finished good</th><th className={thCls}>YTM qty</th>
            <th className={thCls}>Actual / pc</th><th className={thCls}>Budget / pc</th>{rg.any && <th className={thCls} title="Rigid packing cost per piece (last saved ZRIGID rates of the rigid packing items): resin and conversion">Rigid / pc (resin | conv)</th>}
            <th className={thCls}>YTM budget (L)</th><th className={thCls}>YTM actual (L)</th><th className={thCls}>Variance %</th>
            <th className={cx(thCls, '!text-left')}>Source: actual = SAP process orders; budget =</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {byProduct && (
                <tr className="border-t border-line bg-sunken/60 font-bold">
                  <td colSpan={showBrand ? 2 : 1} className="px-2.5 py-1.5 text-left text-xs">{pn ? pn(g.prodha) || g.prodha || '(no product)' : g.prodha || '(no product)'} <span className="font-normal text-muted">· {g.rows.length} finished good(s)</span></td>
                  <td className={tdCls}>{g.qty.toNumber().toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className={tdCls} /><td className={tdCls} />{rg.any && <td className={tdCls} />}
                  <td className={tdCls}>{lakh(g.bud, 2)}</td><td className={tdCls}>{lakh(g.act, 2)}</td>
                  <td className={cx(tdCls, BAND[bandOf(g.bud.gt(0) ? g.act.minus(g.bud).div(g.bud).times(100) : null)])}>{g.bud.gt(0) ? `${g.act.minus(g.bud).div(g.bud).times(100).toFixed(1)} %` : '-'}</td>
                  <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{g.nobud > 0 ? `${g.nobud} without approved budget` : ''}</td>
                </tr>
              )}
              {g.rows.map((r) => {
                const has = r.FgNobud === 0;
                const bud = D(r.YtmBudget), cmp = D(r.YtmActualCmp), v = cmp.minus(bud), p = has && bud.gt(0) ? v.div(bud).times(100) : null;
                return (
                  <tr key={`${r.Matnr}-${r.Zbrand}`} className={cx('border-t border-line/60', !has && 'bg-warn/[0.06]', onOpen && 'cursor-pointer hover:bg-sunken')} onClick={onOpen ? () => onOpen(r) : undefined} title={onOpen ? 'Open the production (process orders, documents, components) of this finished good' : undefined}>
                    {showBrand && <td className="px-2.5 py-1.5 text-left text-xs font-bold">{bn ? bn(r.Zbrand) || r.Zbrand : r.Zbrand}</td>}
                    <td className={cx('px-2.5 py-1.5 text-left text-xs', byProduct && 'pl-6')}><span className="font-bold">{r.Matnr.replace(/^0+/, '')}</span> <span className="text-muted">{r.Maktx}</span></td>
                    <td className={tdCls}>{D(r.YtmQty).toNumber().toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    <td className={tdCls}>{D(r.ActPc).gt(0) ? n4(D(r.ActPc)) : '-'}</td>
                    <td className={tdCls}>{has && D(r.BudPc).gt(0) ? n4(D(r.BudPc)) : <span className="font-semibold text-warn">no budget</span>}</td>
                    {rg.any && (() => { const x = rg.get(r.Matnr, r.Werks); return <td className={tdCls} title={x ? `${x.items} rigid item(s), saved ZRIGID rate${x.flag === 'OK' ? '' : ` (${x.flag})`}` : undefined}>{x ? <>{n4(x.perPc)} <span className="text-2xs text-muted">({n4(x.resin)} | {n4(x.conv)})</span></> : '-'}</td>; })()}
                    <td className={tdCls}>{has ? lakh(bud, 2) : '-'}</td><td className={tdCls}>{lakh(D(r.YtmActual), 2)}</td>
                    <td className={cx(tdCls, 'font-bold', BAND[bandOf(p)])}>{p ? `${p.toFixed(1)} %` : '-'}</td>
                    <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{r.BudSrc}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          {rows.length === 0 && <tr><td colSpan={(showBrand ? 9 : 8) + (rg.any ? 1 : 0)} className="p-3 text-center text-xs text-muted">No finished goods.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
