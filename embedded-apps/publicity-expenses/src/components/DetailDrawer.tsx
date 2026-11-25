'use client';
/**
 * Drill-down of a report figure - the basis behind it, to check against SAP (FAGLB03 / KSB1): the posting lines of
 * ZC_ATLBTL_EXP_DETAIL (G/L x cost centre x profit centre of the report rows under the figure) with company code,
 * cost-centre description, mapping rule and the amount of every selected period (P04, P05, ...) next to the total of
 * the selection. The screen checks that the lines add up to the figure clicked. Views: posting lines, by G/L, by cost
 * centre, by report row. One report row: the SKUs of each line (ZNET_SALE_MASTER), read in a second call in the
 * background (one SAP call per line through the gateway), so the lines show at once. The Excel export carries the
 * selection, the source and how SAP was read.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Download, Search } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { writeBook, type Cell as XCell } from '@/lib/excel';
import { fmtDateTime, growth, pct, periodLabel, UNIT_DIV, UNIT_LABEL } from '@/lib/format';
import type { DrillLine, DrillResult, Sku } from '@/lib/types';
import { Button, Drawer, Empty, Notice, Pill, Skeleton, Tabs, cx, inputBase } from './ui';

export interface Cell {
  label: string;
  /** Reporting keys under the figure: one for a report row, all of them for a sub-total or the grand total. */
  keys: string[];
  group?: string;
  groups?: string[];
  site?: string;
  gl?: string;
  /** Which total the figure is: CY (default) or PY. */
  measure?: 'cy' | 'py';
  /** The figure clicked (INR); the lines are checked against it. */
  value?: number;
}

type View = 'lines' | 'gl' | 'cc' | 'row';
interface Totals { cy: number[]; py: number[]; cyT: number; pyT: number; ccs: number }
interface Agg extends Totals { key: string; title: string; sub: string; extra: string; lines: number }

const PAGE = 200;
const P = (p: number) => `P${String(p).padStart(2, '0')}`;
const noZeros = (s?: string) => (s ?? '').replace(/^0+(?=\d)/, '');
const rowLabel = (l: DrillLine) => l.MISHeading || l.Product || l.ProductGroup || l.ReportingKey;
const ccKey = (l: DrillLine) => `${l.CompanyCode}|${l.CostCenter ?? ''}`;
/** One posting line (the server's line grain), to match the SKUs of the second call to the lines of the first. */
const lineId = (l: DrillLine) => [l.CompanyCode, l.ReportingKey, l.GLAccount, l.Site, l.CostCenter, l.ProfitCenter, l.CostCenterType, l.MappingRule].join('|');

function totalsOf(lines: DrillLine[], n: number): Totals {
  const cy = Array<number>(n).fill(0); const py = Array<number>(n).fill(0); let cyT = 0; let pyT = 0;
  for (const l of lines) {
    for (let i = 0; i < n; i++) { cy[i] += l.cy[i] ?? 0; py[i] += l.py[i] ?? 0; }
    cyT += l.CYYTDAmount; pyT += l.PYYTDAmount;
  }
  return { cy, py, cyT, pyT, ccs: new Set(lines.map(ccKey)).size };
}

function aggregate(lines: DrillLine[], view: Exclude<View, 'lines'>, n: number): Agg[] {
  const groups = new Map<string, DrillLine[]>();
  for (const l of lines) {
    const k = view === 'gl' ? l.GLAccount : view === 'cc' ? ccKey(l) : l.ReportingKey;
    const g = groups.get(k);
    if (g) g.push(l); else groups.set(k, [l]);
  }
  return [...groups.entries()].map(([key, ls]) => {
    const f = ls[0];
    const head = view === 'gl' ? { title: noZeros(f.GLAccount), sub: f.GLAccountName ?? '', extra: [...new Set(ls.map((l) => l.HeaderLabel).filter(Boolean))].join(', ') }
      : view === 'cc' ? { title: f.CostCenter ?? '–', sub: f.CostCenterName ?? '', extra: f.CompanyCode }
        : { title: rowLabel(f), sub: f.ReportingKey, extra: f.ProductRange ?? f.ProductGroup ?? '' };
    return { key, ...head, lines: ls.length, ...totalsOf(ls, n) };
  }).sort((a, b) => Math.abs(b.cyT) - Math.abs(a.cyT));
}

export default function DetailDrawer({ cell, onClose }: { cell: Cell; onClose: () => void }) {
  const { filters, fmt, unit, config, q, sel } = useApp();
  const [state, setState] = useState<DrillResult | { error: string } | null>(null);
  const [view, setView] = useState<View>('lines');
  const [find, setFind] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [skuMap, setSkuMap] = useState<Map<string, Sku[]> | 'loading' | 'error' | null>(null);

  // The figure's own header group(s) / site / G/L, narrowed by the filters in force (the figure was shown with them).
  const req = useMemo(() => {
    const own = cell.groups ?? (cell.group ? [cell.group] : []);
    const groups = own.length ? (filters.groups.length ? own.filter((g) => filters.groups.includes(g)) : own) : filters.groups;
    return { keys: cell.keys, groups, sites: cell.site ? [cell.site] : filters.site, gls: cell.gl ? [cell.gl] : filters.gls };
  }, [cell, filters.groups, filters.site, filters.gls]);

  useEffect(() => {
    let live = true;
    setState(null); setOpen(new Set()); setLimit(PAGE); setSkuMap(null);
    api.detail(q, req).then((b) => {
      if (!live) return;
      setState(b);
      if (req.keys.length !== 1 || !b.rows.length) return;
      // One report row: SKUs in a second call - through the gateway every line is its own SAP call.
      setSkuMap('loading');
      api.detail(q, { ...req, skus: true }).then((s) => {
        if (!live) return;
        const m = new Map<string, Sku[]>();
        for (const l of s.rows) if (l.to_NetSaleMaster?.length) m.set(lineId(l), l.to_NetSaleMaster);
        setSkuMap(m);
      }).catch(() => live && setSkuMap('error'));
    }).catch((e: ApiError) => live && setState({ error: e.message }));
    return () => { live = false; };
  }, [req, q]);

  const ready = state && 'rows' in state ? state : null;
  const periods = ready?.periods ?? sel.periods;
  const n = periods.length;
  const multiP = n > 1;
  const multiRow = cell.keys.length !== 1;
  const lines = useMemo(() => (ready ? [...ready.rows].sort((a, b) => Math.abs(b.CYYTDAmount) - Math.abs(a.CYYTDAmount) || Math.abs(b.PYYTDAmount) - Math.abs(a.PYYTDAmount)) : []), [ready]);
  const shown = useMemo(() => {
    const t = find.trim().toLowerCase();
    const idx = lines.map((l, i) => ({ l, i }));
    if (!t) return idx;
    return idx.filter(({ l }) => [l.GLAccount, noZeros(l.GLAccount), l.GLAccountName, l.CostCenter, l.CostCenterName, l.CompanyCode, l.ProfitCenter, rowLabel(l), l.ReportingKey, l.HeaderLabel, l.MappingRule]
      .some((x) => (x ?? '').toLowerCase().includes(t)));
  }, [lines, find]);
  const all = useMemo(() => totalsOf(lines, n), [lines, n]);
  const part = useMemo(() => totalsOf(shown.map((x) => x.l), n), [shown, n]);
  const aggs = useMemo(() => (view === 'lines' ? [] : aggregate(shown.map((x) => x.l), view, n)), [shown, view, n]);
  const excluded = ready?.excluded ?? [];

  const groupNames = req.groups.map((g) => config.groups.find((x) => x.id === g)?.label ?? g);
  const target = cell.value;
  const got = cell.measure === 'py' ? all.pyT : all.cyT;
  const matches = target === undefined ? null : Math.abs(got - target) < 1;
  const periodGap = multiP ? all.cy.reduce((a, b) => a + b, 0) - all.cyT : 0;
  const skusOf = (l: DrillLine): Sku[] => l.to_NetSaleMaster ?? (skuMap instanceof Map ? skuMap.get(lineId(l)) : undefined) ?? [];
  const skus = !multiRow && lines.some((l) => skusOf(l).length > 0);
  const companies = q.companies.length ? q.companies.join(', ') : 'all companies';
  const source = ready ? (ready.meta.source === 'sap' ? `SAP ${ready.meta.system}` : 'Mock data') : '';

  async function exportXlsx() {
    if (!ready) return;
    const div = UNIT_DIV[unit];
    const v = (x: number) => Math.round((x / div) * 100) / 100;
    const per = periods.map((p) => `${P(p)} ${periodLabel(filters.fy, p)}`);
    const info: XCell[][] = [
      ['Publicity Expenses - drill-down (the posting lines behind a report figure)'],
      ['Figure', cell.label],
      ['Report rows', multiRow ? `${cell.keys.length} report rows` : cell.keys[0]],
      ['Header group', groupNames.join(', ') || 'All'],
      ['Site', req.sites.map((s) => (s === 'UN' ? 'Units' : s)).join(', ') || 'All'],
      ['G/L', req.gls.map(noZeros).join(', ') || 'All'],
      ['Periods', `${sel.cy} (fiscal year ${filters.fy}, ${periods.map(P).join(', ')})`],
      ['Compared with', sel.py],
      ['Company codes', companies],
      ['Source', `${source} · CDS ZC_ATLBTL_EXP_DETAIL · read as ${ready.reads.text}`],
      ['Exclusion rules', q.excl === false ? 'not applied (report shown without them)' : 'applied (rules in force for the latest selected period)'],
      ['Amounts in', UNIT_LABEL[unit]],
      ['Read at', fmtDateTime(ready.meta.fetchedAt)],
      [],
    ];
    const head = ['Company code', 'Reporting key', 'Report row', 'Header', 'G/L', 'G/L name', 'Cost centre', 'Cost centre description', 'CC type', 'Profit centre', 'Site', 'Mapping rule', 'Lookup field', 'Derived no.', 'Product hierarchy', 'Sales brand',
      ...(multiP ? per.map((x) => `CY ${x}`) : []), `CY ${sel.cy}`, ...(multiP ? per.map((x) => `PY ${x}`) : []), `PY ${sel.py}`];
    const body = lines.map((l) => [l.CompanyCode, l.ReportingKey, rowLabel(l), l.HeaderLabel ?? '', noZeros(l.GLAccount), l.GLAccountName ?? '', l.CostCenter ?? '', l.CostCenterName ?? '', l.CostCenterType ?? '', l.ProfitCenter ?? '', l.Site ?? '',
      l.MappingRule ?? '', l.LookupField ?? '', l.DerivedCostCenterNo ?? '', l.ProductHierarchy ?? '', l.SalesBrand ?? '',
      ...(multiP ? l.cy.map(v) : []), v(l.CYYTDAmount), ...(multiP ? l.py.map(v) : []), v(l.PYYTDAmount)]);
    const total = ['Total', ...Array<string>(15).fill(''), ...(multiP ? all.cy.map(v) : []), v(all.cyT), ...(multiP ? all.py.map(v) : []), v(all.pyT)];
    const aggSheet = (name: string, kind: Exclude<View, 'lines'>, cols: string[]) => ({
      name,
      rows: [[`${cell.label} · ${sel.cy} · ${UNIT_LABEL[unit]}`], [], [...cols, 'Lines', 'Cost centres', ...(multiP ? per.map((x) => `CY ${x}`) : []), `CY ${sel.cy}`, `PY ${sel.py}`],
        ...aggregate(lines, kind, n).map((a) => [a.title, a.sub, a.extra, a.lines, a.ccs, ...(multiP ? a.cy.map(v) : []), v(a.cyT), v(a.pyT)])] as XCell[][],
      widths: [16, 34, 16, 7, 9, ...periods.map(() => 12), 13, 13], freeze: { rows: 3 },
    });
    const sheets = [
      { name: 'Drill-down', rows: [...info, head, ...body, total] as XCell[][], widths: [9, 10, 28, 14, 11, 30, 12, 30, 7, 11, 6, 9, 14, 10, 16, 14, ...head.slice(16).map(() => 13)], freeze: { rows: info.length + 1 } },
      aggSheet('By G-L', 'gl', ['G/L', 'G/L name', 'Header']),
      aggSheet('By cost centre', 'cc', ['Cost centre', 'Description', 'Company code']),
      ...(multiRow ? [aggSheet('By report row', 'row', ['Report row', 'Reporting key', 'Brand family'])] : []),
      ...(skus ? [{ name: 'SKUs', rows: [['Cost centre', 'G/L', 'Material', 'SKU size', 'Product', 'Base unit'], ...lines.flatMap((l) => skusOf(l).map((s) => [l.CostCenter ?? '', noZeros(l.GLAccount), noZeros(s.Material), s.SKUSize, s.Product, s.BaseUnit]))] as XCell[][], widths: [12, 11, 18, 10, 30, 8] }] : []),
    ];
    await writeBook(`ATL-BTL-drilldown-${cell.label.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60)}-${sel.cy.replace(/[^A-Za-z0-9'-]+/g, '-')}.xlsx`, sheets);
  }

  const amountHeads = (
    <>
      {multiP && periods.map((p) => <th key={p} className="whitespace-nowrap px-2 py-2 text-right font-bold"><div>{P(p)}</div><div className="text-[10px] font-medium normal-case text-faint">{periodLabel(filters.fy, p)}</div></th>)}
      <th className="whitespace-nowrap px-2 py-2 text-right font-bold"><div>CY</div><div className="text-[10px] font-medium normal-case text-faint">{sel.cy}</div></th>
      <th className="whitespace-nowrap px-2 py-2 text-right font-bold"><div>PY</div><div className="text-[10px] font-medium normal-case text-faint">{sel.py}</div></th>
    </>
  );
  const amountCells = (t: { cy: number[]; cyT: number; pyT: number }, bold = false, testid = false) => (
    <>
      {multiP && t.cy.map((x, i) => <td key={periods[i]} className="num whitespace-nowrap px-2 py-1.5 text-right">{fmt(x)}</td>)}
      <td className={cx('num whitespace-nowrap px-2 py-1.5 text-right', bold ? 'font-extrabold' : 'font-semibold')} data-testid={testid ? 'drill-total-cy' : undefined}>{fmt(t.cyT)}</td>
      <td className="num whitespace-nowrap px-2 py-1.5 text-right text-muted" data-testid={testid ? 'drill-total-py' : undefined}>{fmt(t.pyT)}</td>
    </>
  );
  const textCols = view === 'lines' ? 7 + (multiRow ? 1 : 0) : 5;

  return (
    <Drawer
      open
      onClose={onClose}
      width={Math.min(1640, 1180 + Math.max(0, n - 3) * 72)}
      title={
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Drill-down · {sel.cy} · {UNIT_LABEL[unit]}</div>
          <div className="text-base font-extrabold">{cell.label}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Pill title={cell.keys.slice(0, 40).join(', ')}>{multiRow ? `${cell.keys.length} report rows` : cell.keys[0]}</Pill>
            {groupNames.length > 0 && <Pill tone="accent">{groupNames.length > 3 ? `${groupNames.length} header groups` : groupNames.join(', ')}</Pill>}
            {req.sites.length > 0 && <Pill>{req.sites.map((s) => (s === 'UN' ? 'Units' : s)).join(', ')}</Pill>}
            {req.gls.length > 0 && <Pill>G/L {req.gls.length > 3 ? `${req.gls.length} accounts` : req.gls.map(noZeros).join(', ')}</Pill>}
            <Pill>{q.companies.length ? `Co. ${q.companies.join(', ')}` : 'All companies'}</Pill>
            {cell.measure === 'py' && <Pill tone="warn">PY figure</Pill>}
          </div>
        </div>
      }
    >
      {!state && <Skeleton rows={8} />}
      {state && 'error' in state && <Notice>{state.error}</Notice>}
      {ready && !lines.length && <Empty title="No posting lines behind this figure">{excluded.length ? `${excluded.length} line(s) are taken out by exclusion rules.` : 'SAP returned no detail lines for this selection.'}</Empty>}
      {ready && lines.length > 0 && (
        <div className="space-y-3">
          {matches === true && (
            <div className="flex items-start gap-2 rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-[13px] font-medium text-good" data-testid="drill-check">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{lines.length} posting line{lines.length === 1 ? '' : 's'} add up to <b className="num">{fmt(target!)}</b> - the {cell.measure === 'py' ? 'PY ' : ''}figure in the report.</span>
            </div>
          )}
          {matches === false && (
            <Notice tone="warn">The lines add up to <b className="num">{fmt(got)}</b>; the report shows <b className="num">{fmt(target!)}</b> (difference {fmt(got - target!)}). Lines with no G/L (uploaded budget) have no posting lines; press Refresh if SAP changed since the report was read.</Notice>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[[`CY ${sel.cy}`, fmt(all.cyT), ''], [`PY ${sel.py}`, fmt(all.pyT), ''], ['Growth', pct(growth(all.cyT, all.pyT)), 'CY vs PY'], ['Posting lines', String(lines.length), `${all.ccs} cost centre${all.ccs === 1 ? '' : 's'}`]].map(([l, v, s]) => (
              <div key={l} className="rounded-xl border border-line bg-panel p-3">
                <div className="truncate text-2xs font-bold uppercase text-muted" title={l}>{l}</div>
                <div className="num truncate text-lg font-extrabold">{v}</div>
                {s && <div className="truncate text-2xs text-muted">{s}</div>}
              </div>
            ))}
          </div>
          <p className="text-2xs text-muted" data-testid="drill-basis">
            <b className="text-ink">Basis:</b> {source} · CDS ZC_ATLBTL_EXP_DETAIL (G/L × cost centre × profit centre) · fiscal year {filters.fy} · read as <span className="font-mono">{ready.reads.text}</span>
            {' '}· {companies} · {q.excl === false ? 'without exclusion rules' : `exclusion rules in force for ${P(sel.latest)} applied`}. Each period column is that period alone; CY is the selection total, read the same way as the report.
          </p>
          {skuMap === 'loading' && <p className="text-2xs text-muted" data-testid="sku-loading">Reading the SKUs of each line (ZNET_SALE_MASTER) from SAP in the background - about a second per line; the lines and amounts above are complete.</p>}
          {skuMap === 'error' && <p className="text-2xs text-warn">The SKUs could not be read from SAP; the lines and amounts are complete.</p>}
          {Math.abs(periodGap) >= 1 && (
            <Notice tone="warn"><AlertTriangle size={13} className="mr-1 inline" />The period columns add up to {fmt(all.cy.reduce((a, b) => a + b, 0))}; the selection total read from SAP as YTD is {fmt(all.cyT)} (difference {fmt(periodGap)}): SAP counts postings in the YTD that are in no single period 1-12 (e.g. special periods 13-16).</Notice>
          )}
          {excluded.length > 0 && (
            <Notice tone="warn">
              {excluded.length} line{excluded.length === 1 ? '' : 's'} ({fmt(excluded.reduce((s, r) => s + r.CYYTDAmount, 0))} CY) excluded by rule{new Set(excluded.map((r) => r.ExcludedBy)).size === 1 ? '' : 's'} #{[...new Set(excluded.map((r) => r.ExcludedBy))].join(', #')}: {excluded.slice(0, 3).map((r) => `${r.CostCenter} / G/L ${noZeros(r.GLAccount)}`).join('; ')}{excluded.length > 3 ? ' …' : ''}
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Tabs<View> label="Show" value={view} onChange={(v) => { setView(v); setLimit(PAGE); }} tabs={[
              { id: 'lines', label: 'Posting lines' }, { id: 'gl', label: 'By G/L' }, { id: 'cc', label: 'By cost centre' }, ...(multiRow ? [{ id: 'row' as const, label: 'By report row' }] : []),
            ]} />
            <label className={cx('flex h-8 min-w-[10rem] flex-1 items-center gap-1.5 sm:max-w-[16rem]', inputBase)}>
              <Search size={13} className="text-faint" />
              <input value={find} onChange={(e) => { setFind(e.target.value); setLimit(PAGE); }} placeholder="Find G/L, cost centre, name…" aria-label="Find in the drill-down" className="h-full min-w-0 flex-1 bg-transparent text-xs outline-none" />
            </label>
            <div className="flex-1" />
            <Button size="sm" onClick={exportXlsx}><Download size={14} /> Excel</Button>
          </div>
          {find && <p className="text-2xs text-muted">{shown.length} of {lines.length} lines match “{find}”; the total row is for the matching lines.</p>}
          <div className="scroll-thin overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-left text-[12px]" data-testid="drill-table">
              <thead>
                {view === 'lines' ? (
                  <tr className="border-b border-line align-bottom text-2xs uppercase tracking-wide text-muted">
                    {['', 'G/L', 'Cost centre', 'Co. code', 'Profit centre', 'Site', ...(multiRow ? ['Report row'] : []), 'Mapping'].map((h, i) => <th key={`${h}${i}`} className="whitespace-nowrap px-2 py-2 font-bold">{h}</th>)}
                    {amountHeads}
                  </tr>
                ) : (
                  <tr className="border-b border-line align-bottom text-2xs uppercase tracking-wide text-muted">
                    {(view === 'gl' ? ['G/L', 'Name', 'Header'] : view === 'cc' ? ['Cost centre', 'Description', 'Co. code'] : ['Report row', 'Key', 'Brand family']).map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 font-bold">{h}</th>)}
                    <th className="px-2 py-2 text-right font-bold">Lines</th><th className="px-2 py-2 text-right font-bold">Cost centres</th>
                    {amountHeads}
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-line">
                {view === 'lines' ? shown.slice(0, limit).map(({ l, i }) => {
                  const sk = skusOf(l);
                  const isOpen = open.has(i);
                  return (
                    <Fragment key={i}>
                      <tr className="align-top hover:bg-sunken">
                        <td className="px-2 py-1.5">
                          {sk.length > 0 && (
                            <button type="button" className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-line" aria-label={isOpen ? 'Hide SKUs' : 'Show SKUs'} onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; })}>
                              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5"><div className="font-semibold">{noZeros(l.GLAccount)}</div><div className="max-w-[12rem] truncate text-2xs text-muted" title={`${l.GLAccountName ?? ''} · ${l.HeaderLabel ?? ''}`}>{l.GLAccountName}{l.HeaderLabel ? ` · ${l.HeaderLabel}` : ''}</div></td>
                        <td className="px-2 py-1.5"><div className="font-semibold">{l.CostCenter || '–'}</div><div className="max-w-[15rem] text-2xs leading-snug text-muted">{l.CostCenterName}{l.CostCenterType ? ` · type ${l.CostCenterType}` : ''}</div></td>
                        <td className="px-2 py-1.5 font-semibold">{l.CompanyCode}</td>
                        <td className="px-2 py-1.5">{l.ProfitCenter}</td>
                        <td className="px-2 py-1.5">{l.Site === 'UN' ? 'Units' : l.Site}</td>
                        {multiRow && <td className="px-2 py-1.5"><div className="max-w-[12rem] truncate" title={rowLabel(l)}>{rowLabel(l)}</div><div className="text-2xs text-muted">{l.ReportingKey}</div></td>}
                        <td className="px-2 py-1.5"><Pill title={`Looked up in ${l.LookupField ?? '–'}, derived number ${l.DerivedCostCenterNo ?? '–'}${l.ProductHierarchy ? `, product hierarchy ${l.ProductHierarchy}` : ''}`}>{l.MappingRule ?? '–'}</Pill><div className="text-2xs text-muted">{l.LookupField}</div></td>
                        {amountCells({ cy: l.cy, cyT: l.CYYTDAmount, pyT: l.PYYTDAmount })}
                      </tr>
                      {isOpen && (
                        <tr className="bg-sunken/60">
                          <td />
                          <td colSpan={textCols - 1 + (multiP ? n : 0) + 2} className="px-2 py-2">
                            <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">SKUs in this product group (ZNET_SALE_MASTER) - the amount is booked per cost centre, not split per SKU</div>
                            <div className="flex flex-wrap gap-1.5">
                              {sk.map((s) => <span key={s.Material} className="rounded-lg border border-line bg-panel px-2 py-1 text-2xs"><b>{noZeros(s.Material)}</b> · {s.SKUSize} · {s.Product}</span>)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }) : aggs.slice(0, limit).map((a) => (
                  <tr key={a.key} className="align-top hover:bg-sunken">
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{a.title}</td>
                    <td className="max-w-[16rem] px-2 py-1.5 text-muted">{a.sub}</td>
                    <td className="max-w-[10rem] truncate px-2 py-1.5 text-2xs text-muted" title={a.extra}>{a.extra}</td>
                    <td className="num px-2 py-1.5 text-right">{a.lines}</td>
                    <td className="num px-2 py-1.5 text-right">{a.ccs}</td>
                    {amountCells(a)}
                  </tr>
                ))}
                <tr className="bg-sunken font-bold">
                  <td colSpan={textCols} className="px-2 py-1.5">Total{find ? ` (${shown.length} matching lines)` : ''}</td>
                  {amountCells(part, true, true)}
                </tr>
              </tbody>
            </table>
          </div>
          {(view === 'lines' ? shown.length : aggs.length) > limit && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="text-muted">Showing {limit} of {view === 'lines' ? shown.length : aggs.length} (the total row and the Excel file cover all)</span>
              <Button size="sm" onClick={() => setLimit((x) => x + PAGE * 5)}>Show more</Button>
              <Button size="sm" variant="ghost" onClick={() => setLimit(Infinity)}>Show all</Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
