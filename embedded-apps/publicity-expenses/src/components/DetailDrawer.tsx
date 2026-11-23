'use client';
/** Drill-down of one report cell: ZC_ATLBTL_EXP_DETAIL rows (G/L x cost centre x profit centre) with their SKUs. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { growth, pct, UNIT_LABEL, ytdLabel } from '@/lib/format';
import type { DetailRow } from '@/lib/types';
import { Button, Drawer, Empty, Notice, Pill, Skeleton, cx } from './ui';

export interface Cell { key: string; label: string; group?: string; site?: string; gl?: string }

export default function DetailDrawer({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  const { filters, fmt, unit, config, q } = useApp();
  const [state, setState] = useState<{ rows: DetailRow[]; excluded: DetailRow[] } | { error: string } | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    let live = true;
    setState(null);
    api.detail(q, { key: cell.key, gl: cell.gl, site: cell.site })
      .then((b) => live && setState({ rows: b.rows, excluded: b.excluded ?? [] }))
      .catch((e: ApiError) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [cell, q]);

  const rows = useMemo(() => {
    if (!state || !('rows' in state)) return [];
    return state.rows.filter((r) => !cell.group || r.HeaderGroup === cell.group).sort((a, b) => b.CYYTDAmount - a.CYYTDAmount);
  }, [state, cell.group]);
  const sum = (k: keyof DetailRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const excluded = state && 'excluded' in state ? state.excluded.filter((r) => !cell.group || r.HeaderGroup === cell.group) : [];
  const groupLabel = config.groups.find((g) => g.id === cell.group)?.label ?? cell.group;

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const div = unit === 'lakh' ? 1e5 : unit === 'crore' ? 1e7 : 1;
    const out: (string | number)[][] = [['G/L', 'G/L name', 'Header', 'Site', 'Cost centre', 'Cost centre name', 'Profit centre', 'CC type', 'Mapping rule', 'Lookup field', 'Derived no.', 'Product hierarchy', 'Sales brand', `CY YTD (${UNIT_LABEL[unit]})`, `PY YTD (${UNIT_LABEL[unit]})`, `CY period (${UNIT_LABEL[unit]})`, 'SKU material', 'SKU size']];
    for (const r of rows) {
      const base = [r.GLAccount, r.GLAccountName, r.HeaderLabel, r.Site, r.CostCenter, r.CostCenterName, r.ProfitCenter, r.CostCenterType, r.MappingRule, r.LookupField, r.DerivedCostCenterNo, r.ProductHierarchy, r.SalesBrand,
        Math.round((r.CYYTDAmount / div) * 100) / 100, Math.round((r.PYYTDAmount / div) * 100) / 100, Math.round((r.CYPeriodAmount / div) * 100) / 100];
      const skus = r.to_NetSaleMaster ?? [];
      if (!skus.length) out.push([...base, '', '']);
      // The amount is booked per cost centre, not per SKU: it is written once, the SKU lines below it carry no amount.
      skus.forEach((s, i) => out.push(i === 0 ? [...base, s.Material, s.SKUSize] : [...base.map((v, j) => (j >= 13 ? '' : v)), s.Material, s.SKUSize]));
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(out), 'Drill-down');
    XLSX.writeFile(wb, `ATL-BTL-drilldown-${cell.label.replace(/[^A-Za-z0-9]+/g, '-')}.xlsx`);
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={980}
      title={
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Drill-down · {ytdLabel(filters.fy, filters.period)} · {UNIT_LABEL[unit]}</div>
          <div className="text-base font-extrabold">{cell.label}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill>{cell.key}</Pill>
            {groupLabel && <Pill tone="accent">{groupLabel}</Pill>}
            {cell.site && <Pill>{cell.site === 'HO' ? 'HO' : 'Units'}</Pill>}
            {cell.gl && <Pill>G/L {cell.gl.replace(/^0+/, '')}</Pill>}
          </div>
        </div>
      }
    >
      {!state && <Skeleton rows={8} />}
      {state && 'error' in state && <Notice>{state.error}</Notice>}
      {state && 'rows' in state && !rows.length && <Empty title="No postings behind this figure" />}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['CY YTD', sum('CYYTDAmount')], ['PY YTD', sum('PYYTDAmount')], ['CY period', sum('CYPeriodAmount')]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl border border-line bg-panel p-3"><div className="text-2xs font-bold uppercase text-muted">{l}</div><div className="num text-lg font-extrabold">{fmt(v as number)}</div></div>
            ))}
            <div className="rounded-xl border border-line bg-panel p-3"><div className="text-2xs font-bold uppercase text-muted">Growth</div><div className="num text-lg font-extrabold">{pct(growth(sum('CYYTDAmount'), sum('PYYTDAmount')))}</div></div>
          </div>
          {excluded.length > 0 && (
            <Notice tone="warn">
              {excluded.length} line{excluded.length === 1 ? '' : 's'} ({fmt(excluded.reduce((s, r) => s + r.CYYTDAmount, 0))} CY) excluded by rule{new Set(excluded.map((r) => r.ExcludedBy)).size === 1 ? '' : 's'} #{[...new Set(excluded.map((r) => r.ExcludedBy))].join(', #')}: {excluded.slice(0, 3).map((r) => `${r.CostCenter} / G/L ${r.GLAccount.replace(/^0+/, '')}`).join('; ')}{excluded.length > 3 ? ' …' : ''}
            </Notice>
          )}
          <div className="flex items-center justify-between">
            <p className="text-2xs text-muted">{rows.length} posting line{rows.length === 1 ? '' : 's'} (G/L × cost centre × profit centre). Open a line for its SKUs.</p>
            <Button size="sm" onClick={exportXlsx}><Download size={14} /> Excel</Button>
          </div>
          <div className="scroll-thin overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">
                  {['', 'G/L', 'Cost centre', 'Profit centre', 'Site', 'Rule', 'Brand / hierarchy'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-bold">{h}</th>)}
                  {['CY YTD', 'PY YTD', 'CY period'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-right font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const skus = r.to_NetSaleMaster ?? [];
                  const isOpen = open.has(i);
                  return (
                    <Fragment key={`${r.GLAccount}|${r.CostCenter}|${r.ProfitCenter}|${i}`}>
                      <tr className="align-top hover:bg-sunken">
                        <td className="px-2 py-1.5">
                          {skus.length > 0 && (
                            <button type="button" className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-line" aria-label={isOpen ? 'Hide SKUs' : 'Show SKUs'} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5"><div className="font-semibold">{r.GLAccount.replace(/^0+/, '')}</div><div className="max-w-[12rem] truncate text-2xs text-muted" title={r.GLAccountName}>{r.GLAccountName}</div></td>
                        <td className="px-2 py-1.5"><div className="font-semibold">{r.CostCenter}</div><div className="max-w-[12rem] truncate text-2xs text-muted" title={r.CostCenterName}>{r.CostCenterName} · type {r.CostCenterType || '–'}</div></td>
                        <td className="px-2 py-1.5">{r.ProfitCenter}</td>
                        <td className="px-2 py-1.5">{r.Site}</td>
                        <td className="px-2 py-1.5"><Pill title={`Looked up in ${r.LookupField}, derived number ${r.DerivedCostCenterNo}`}>{r.MappingRule}</Pill><div className="text-2xs text-muted">{r.LookupField}</div></td>
                        <td className="px-2 py-1.5"><div>{r.SalesBrand || r.ProductGroup}</div><div className="text-2xs text-muted">{r.ProductHierarchy || '–'}</div></td>
                        <td className="num px-2 py-1.5 text-right font-semibold">{fmt(r.CYYTDAmount)}</td>
                        <td className="num px-2 py-1.5 text-right text-muted">{fmt(r.PYYTDAmount)}</td>
                        <td className="num px-2 py-1.5 text-right">{fmt(r.CYPeriodAmount)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-sunken/60">
                          <td />
                          <td colSpan={9} className="px-2 py-2">
                            <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">SKUs in this product group (ZNET_SALE_MASTER) - the amount is booked per cost centre, not split per SKU</div>
                            <div className="flex flex-wrap gap-1.5">
                              {skus.map((s) => <span key={s.Material} className={cx('rounded-lg border border-line bg-panel px-2 py-1 text-2xs')}><b>{s.Material.replace(/^0+/, '')}</b> · {s.SKUSize} · {s.Product}</span>)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="bg-sunken font-bold">
                  <td colSpan={7} className="px-2 py-1.5">Total</td>
                  <td className="num px-2 py-1.5 text-right">{fmt(sum('CYYTDAmount'))}</td>
                  <td className="num px-2 py-1.5 text-right">{fmt(sum('PYYTDAmount'))}</td>
                  <td className="num px-2 py-1.5 text-right">{fmt(sum('CYPeriodAmount'))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}
