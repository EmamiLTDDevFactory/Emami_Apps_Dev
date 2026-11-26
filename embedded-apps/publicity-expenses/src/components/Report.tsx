'use client';
/**
 * The MIS report ("Details Of Advertisement Expenses"), as the layout sheets:
 *  - Summary layout: per report-header group RB FY / RB YTD / OB FY / OB YTD / CY Actual HO / CY Actual Units / CY Total /
 *    PY Total, then GR TOTAL MIS, DSR AND OTHER EXP and GR TOTAL LR.
 *  - Drill-down layout: the same grid with the G/L columns of a group opened (CY HO per G/L, then CY Units per G/L) -
 *    click a group heading, or "All G/L columns".
 *  - Any figure (a reporting row, a sub-total, the grand total, GR Total MIS / LR) opens the posting lines behind it
 *    (ZC_ATLBTL_EXP_DETAIL: G/L x cost centre, with the amount of each selected period), which add up to the figure.
 * Rows: category > range > product type > reporting row with sub-totals, sorted by SerialNo, T1, T2, T3.
 */
import { Fragment, startTransition, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Columns3, Download, Equal, Minus, Plus, Sparkles } from 'lucide-react';
import { useApp } from '@/lib/context';
import { fyLabel, growth, pct, RAG_AMBER_UPTO, trendOf, UNIT_LABEL, type Trend } from '@/lib/format';
import { buildTree, cyOf, groupColumns, isZero, keysOf, nodeMeasures, zero, type GroupCol, type Measures, type Node } from '@/lib/model';
import DetailDrawer, { type Cell } from './DetailDrawer';
import { Button, Card, Empty, Tabs, cx } from './ui';

type Mode = 'mis' | 'compact';
type Depth = 0 | 1 | 2 | 3;

interface Col {
  id: string;
  band: string; // top header (group label)
  bandKey: string;
  label: string;
  sub?: string;
  tone?: 'total' | 'budget' | 'gl';
  value: (n: Node, nm: ReturnType<typeof nodeMeasures>) => number | null;
  pct?: boolean;
  /** What a click on the figure drills into (header group(s), site, G/L; measure = which total it must equal). */
  drill?: Omit<Cell, 'label' | 'keys' | 'value'>;
  /** var = CY - PY (signed, coloured); trend = % variance with direction icon and RAG colour (value = the %). */
  kind?: 'var' | 'trend';
  /** CY and PY of the cell, for the variance columns. */
  pair?: (n: Node, nm: ReturnType<typeof nodeMeasures>) => [number, number];
}

type Pair = NonNullable<Col['pair']>;
/** Variance (CY - PY) and % variance with RAG of a CY / PY pair - the compact view's comparison columns. */
function varCols(base: Pick<Col, 'band' | 'bandKey' | 'tone'>, id: string, pair: Pair): Col[] {
  return [
    { ...base, id: `${id}|var`, label: 'Variance', sub: 'CY - PY', kind: 'var', pair, value: (n, nm) => { const [cy, py] = pair(n, nm); return cy - py; } },
    { ...base, id: `${id}|vpct`, label: '% Var', sub: 'CY vs PY', kind: 'trend', pair, value: (n, nm) => trendOf(...pair(n, nm)).pct },
  ];
}

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Equal, stopped: ArrowDownRight, new: Sparkles } as const;
const RAG_CLS = { red: 'bg-bad/15 text-bad', amber: 'bg-warn/15 text-warn', green: 'bg-good/15 text-good', new: 'bg-accent/15 text-accent', none: '' } as const;
/** % variance as a chip: direction icon, the %, RAG colour; "New" where PY had nothing (counted as +100 %). */
function TrendChip({ t }: { t: Trend }) {
  if (t.kind === 'none') return <span className="text-faint">–</span>;
  const Icon = TREND_ICON[t.kind];
  const text = t.kind === 'new' ? 'New' : t.kind === 'stopped' ? 'Stopped' : `${(t.pct ?? 0) > 0 ? '+' : ''}${(t.pct ?? 0).toFixed(1)}%`;
  return (
    <span className={cx('inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-px text-[11px] font-bold', RAG_CLS[t.rag])} title={t.label} data-trend={t.kind}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />{text}
    </span>
  );
}
const STATUS: Record<Trend['kind'], string> = { none: '', new: 'New (no PY = +100%)', stopped: 'Stopped (-100%)', up: 'Increase', down: 'Decrease', flat: 'No change' };

/** G/L x site columns with no amount in the current selection are left out (the sheet's hidden columns). */
type GlTotals = Map<string, { ho: number; un: number }>;

function groupCols(g: GroupCol, mode: Mode, open: boolean, fy: string, ytd: string, pyYtd: string, glTotals: GlTotals): Col[] {
  const m = (n: Node) => n.byGroup.get(g.id) ?? zero();
  const base = { band: g.label, bandKey: g.id };
  if (mode === 'compact') {
    return [
      { ...base, id: `${g.id}|cy`, label: 'CY Total', sub: ytd, tone: 'total', value: (n) => cyOf(m(n)), drill: { group: g.id } },
      { ...base, id: `${g.id}|py`, label: 'PY Total', sub: pyYtd, value: (n) => m(n).py, drill: { group: g.id, measure: 'py' } },
      ...varCols(base, g.id, (n) => [cyOf(m(n)), m(n).py]),
    ];
  }
  const has = (gl: string, site: 'HO' | 'UN') => { const t = glTotals.get(`${g.id}|${gl}`); return !!t && Math.abs(site === 'HO' ? t.ho : t.un) >= 0.5; };
  const glCols = (site: 'HO' | 'UN'): Col[] => (open ? g.gls.filter((x) => has(x.gl, site)).map((x) => ({
    ...base, id: `${g.id}|${site}|${x.gl}`, label: x.name || x.gl, sub: `${x.gl.replace(/^0+/, '')} · ${site === 'HO' ? 'HO' : 'Units'}`, tone: 'gl' as const,
    value: (n: Node) => { const v = n.byGl.get(`${g.id}|${x.gl}`); return v ? (site === 'HO' ? v.ho : v.un) : 0; }, drill: { group: g.id, site, gl: x.gl },
  })) : []);
  return [
    { ...base, id: `${g.id}|rba`, label: 'RB', sub: fy, tone: 'budget', value: (n) => m(n).rba },
    { ...base, id: `${g.id}|rby`, label: 'RB', sub: ytd, tone: 'budget', value: (n) => m(n).rby },
    { ...base, id: `${g.id}|oba`, label: 'OB', sub: fy, tone: 'budget', value: (n) => m(n).oba },
    { ...base, id: `${g.id}|oby`, label: 'OB', sub: ytd, tone: 'budget', value: (n) => m(n).oby },
    ...glCols('HO'),
    { ...base, id: `${g.id}|ho`, label: 'CY Actual HO', sub: ytd, value: (n) => m(n).ho, drill: { group: g.id, site: 'HO' } },
    ...glCols('UN'),
    { ...base, id: `${g.id}|un`, label: 'CY Actual Units', sub: ytd, value: (n) => m(n).un, drill: { group: g.id, site: 'UN' } },
    { ...base, id: `${g.id}|cy`, label: 'CY Total', sub: ytd, tone: 'total', value: (n) => cyOf(m(n)), drill: { group: g.id } },
    { ...base, id: `${g.id}|py`, label: 'PY Total', sub: pyYtd, value: (n) => m(n).py, drill: { group: g.id, measure: 'py' } },
  ];
}

/** GR Total MIS (groups with mis = true) and GR Total LR (every group). misIds = the MIS groups, for the drill-down. */
function totalCols(id: 'mis' | 'lr', label: string, mode: Mode, fy: string, ytd: string, pyYtd: string, misIds: string[]): Col[] {
  const pick = (nm: ReturnType<typeof nodeMeasures>): Measures => (id === 'mis' ? nm.mis : nm.lr);
  const base = { band: label, bandKey: id, tone: 'total' as const };
  const d = id === 'mis' ? { groups: misIds } : {};
  const cyPy: Col[] = [
    { ...base, id: `${id}|cy`, label: 'CY Total', sub: ytd, value: (_n, nm) => cyOf(pick(nm)), drill: d },
    { ...base, id: `${id}|py`, label: 'PY Total', sub: pyYtd, value: (_n, nm) => pick(nm).py, drill: { ...d, measure: 'py' } },
    { ...base, id: `${id}|gr`, label: 'Growth', sub: 'CY vs PY', pct: true, value: (_n, nm) => growth(cyOf(pick(nm)), pick(nm).py) },
  ];
  if (mode === 'compact') {
    const cmp: Col[] = [...cyPy.slice(0, 2), ...varCols(base, id, (_n, nm) => [cyOf(pick(nm)), pick(nm).py])];
    return id === 'lr'
      ? [...cmp, { ...base, id: 'lr|rby', label: 'RB', sub: ytd, value: (_n, nm) => nm.lr.rby }, { ...base, id: 'lr|ut', label: 'Utilised', sub: 'CY / RB', pct: true, value: (_n, nm) => (nm.lr.rby ? (cyOf(nm.lr) / nm.lr.rby) * 100 : null) }]
      : cmp;
  }
  return [
    { ...base, id: `${id}|rba`, label: 'RB', sub: fy, value: (_n, nm) => pick(nm).rba },
    { ...base, id: `${id}|rby`, label: 'RB', sub: ytd, value: (_n, nm) => pick(nm).rby },
    { ...base, id: `${id}|oba`, label: 'OB', sub: fy, value: (_n, nm) => pick(nm).oba },
    { ...base, id: `${id}|oby`, label: 'OB', sub: ytd, value: (_n, nm) => pick(nm).oby },
    { ...base, id: `${id}|ho`, label: 'CY Actual HO', sub: ytd, value: (_n, nm) => pick(nm).ho, drill: { ...d, site: 'HO' } },
    { ...base, id: `${id}|un`, label: 'CY Actual Units', sub: ytd, value: (_n, nm) => pick(nm).un, drill: { ...d, site: 'UN' } },
    ...cyPy,
  ];
}

interface Line { node: Node; kind: 'header' | 'row' | 'total' | 'grand'; depth: number; label: string; collapsed?: boolean }

export default function Report() {
  const { rows, config, filters, unit, fmt, sel } = useApp();
  const [mode, setMode] = useState<Mode>('mis');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState<Depth>(3);
  const [toggled, setToggled] = useState<Set<string>>(new Set()); // rows opened / closed by hand against the depth
  const [showZero, setShowZero] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  // Phones open on the compact columns, down to ranges; the full MIS layout is one tap away.
  useEffect(() => { if (window.matchMedia('(max-width: 640px)').matches) { setMode('compact'); setDepth(1); } }, []);

  const groups = useMemo(() => groupColumns(rows, config), [rows, config]);
  const tree = useMemo(() => buildTree(rows), [rows]);
  const fy = fyLabel(filters.fy); const ytd = sel.cy; const pyYtd = sel.py;

  const cols = useMemo(() => {
    const out: Col[] = [];
    const mis = groups.filter((g) => g.mis); const rest = groups.filter((g) => !g.mis);
    for (const g of mis) out.push(...groupCols(g, mode, openGroups.has(g.id), fy, ytd, pyYtd, tree.byGl));
    out.push(...totalCols('mis', 'GR Total MIS', mode, fy, ytd, pyYtd, mis.map((g) => g.id)));
    for (const g of rest) out.push(...groupCols(g, mode, openGroups.has(g.id), fy, ytd, pyYtd, tree.byGl));
    out.push(...totalCols('lr', 'GR Total LR', mode, fy, ytd, pyYtd, mis.map((g) => g.id)));
    return out;
  }, [groups, mode, openGroups, fy, ytd, pyYtd, tree]);

  const bands = useMemo(() => {
    const b: { key: string; label: string; span: number; group?: GroupCol }[] = [];
    for (const c of cols) {
      const last = b[b.length - 1];
      if (last && last.key === c.bandKey) last.span += 1;
      else b.push({ key: c.bandKey, label: c.band, span: 1, group: groups.find((g) => g.id === c.bandKey) });
    }
    return b;
  }, [cols, groups]);

  /** Flatten the tree into display lines: header, children, sub-total (or one line when collapsed). */
  const lines = useMemo(() => {
    const out: Line[] = [];
    const keep = (n: Node): boolean => (showZero || !isZero(n)) && (showHidden || n.level < 3 || n.visibleInMIS);
    const walk = (n: Node) => {
      const kids = n.children.filter(keep);
      if (n.level === 3) { out.push({ node: n, kind: 'row', depth: 3, label: n.label }); return; }
      // A product type holding a single row of the same name is shown as that row.
      const isCollapsed = (n.level >= depth) !== toggled.has(n.id);
      if (!isCollapsed && n.level === 2 && kids.length === 1 && kids[0].label === n.label) { walk(kids[0]); return; }
      if (isCollapsed || !kids.length) { out.push({ node: n, kind: 'total', depth: n.level, label: n.label, collapsed: true }); return; }
      out.push({ node: n, kind: 'header', depth: n.level, label: n.label });
      kids.forEach(walk);
      out.push({ node: n, kind: 'total', depth: n.level, label: `${n.label} TOTAL` });
    };
    tree.children.filter(keep).forEach(walk);
    out.push({ node: tree, kind: 'grand', depth: 0, label: 'TOTAL' });
    return out;
  }, [tree, depth, toggled, showZero, showHidden]);

  const toggle = (id: string) => setToggled((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (id: string) => startTransition(() => setOpenGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }));
  const allOpen = groups.length > 0 && groups.every((g) => openGroups.has(g.id));

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    // A % Var column is followed by its status in words (Increase / Decrease / New (no PY = +100%) ...), as the chip shows it.
    const xc = cols.flatMap((c) => (c.kind === 'trend' ? [c, { ...c, id: `${c.id}|st`, label: 'Status', sub: 'CY vs PY' }] : [c]));
    const head1 = ['Details Of Advertisement Expenses', ...xc.map((c) => c.band)];
    const head2 = ['ITEM', ...xc.map((c) => c.label)];
    const head3 = [`${ytd} · ${UNIT_LABEL[unit]}`, ...xc.map((c) => c.sub ?? '')];
    const div = unit === 'lakh' ? 1e5 : unit === 'crore' ? 1e7 : 1;
    const body = lines.map((l) => {
      const nm = nodeMeasures(l.node, groups);
      const label = `${'  '.repeat(l.depth)}${l.label}`;
      if (l.kind === 'header') return [label];
      return [label, ...xc.map((c) => {
        if (c.id.endsWith('|st') && c.pair) return STATUS[trendOf(...c.pair(l.node, nm)).kind];
        const v = c.value(l.node, nm);
        return v === null ? '' : c.pct || c.kind === 'trend' ? Math.round(v * 10) / 10 : Math.round((v / div) * 100) / 100;
      })];
    });
    const ws = XLSX.utils.aoa_to_sheet([head1, head2, head3, ...body]);
    ws['!cols'] = [{ wch: 42 }, ...xc.map((c) => ({ wch: c.id.endsWith('|st') ? 19 : 13 }))];
    ws['!freeze'] = { xSplit: 1, ySplit: 3 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'mis' ? 'Summary' : 'Compact');
    XLSX.writeFile(wb, `ATL-BTL-expenses-${ytd.replace(/[^A-Za-z0-9'-]+/g, '-')}.xlsx`);
  }

  /** Open the posting lines behind a figure of a line (a row, a sub-total or the grand total). */
  const drillInto = (l: Line, d: NonNullable<Col['drill']>, value: number) => setCell({
    label: l.kind === 'row' ? l.label : l.kind === 'grand' ? 'All report rows (TOTAL)' : `${l.node.label} (total)`,
    keys: keysOf(l.node), ...d, value,
  });

  if (!rows.length) return <Card><Empty title="No expenses for this selection">Change the period or clear a filter.</Empty></Card>;

  const rowCls = (l: Line) => cx(
    'border-b border-line',
    l.kind === 'grand' && 'bg-plum text-white font-extrabold',
    l.kind === 'total' && !l.collapsed && 'bg-sunken font-bold',
    l.kind === 'total' && l.collapsed && 'bg-panel font-semibold',
    l.kind === 'header' && 'bg-panel',
    l.kind === 'row' && 'bg-panel hover:bg-accent/[0.04]',
  );

  return (
    <Card bodyClass="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Tabs label="Layout" value={mode} onChange={setMode} tabs={[{ id: 'mis', label: 'MIS layout' }, { id: 'compact', label: 'Compact' }]} />
        {mode === 'mis' && (
          <Button size="sm" data-testid="gl-toggle" variant={allOpen ? 'primary' : 'secondary'} onClick={() => startTransition(() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.id))))}>
            <Columns3 size={14} /> {allOpen ? 'Hide G/L columns' : 'All G/L columns'}
          </Button>
        )}
        <Tabs<string> label="Rows down to" value={String(depth)} onChange={(v) => { setDepth(Number(v) as Depth); setToggled(new Set()); }}
          tabs={[{ id: '0', label: 'Categories' }, { id: '1', label: 'Ranges' }, { id: '2', label: 'Brands' }, { id: '3', label: 'All rows' }]} />
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted"><input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} className="accent-[rgb(var(--accent))]" /> Zero rows</label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-[rgb(var(--accent))]" /> Rows hidden in MIS</label>
        {mode === 'compact' && (
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted" data-testid="rag-legend">
            <span className="font-semibold">% Var vs PY:</span>
            <TrendChip t={{ kind: 'up', pct: RAG_AMBER_UPTO + 5, rag: 'red', label: `Higher than PY by more than ${RAG_AMBER_UPTO} %` }} /><span>more than {RAG_AMBER_UPTO}% up</span>
            <TrendChip t={{ kind: 'up', pct: RAG_AMBER_UPTO / 2, rag: 'amber', label: `Higher than PY by up to ${RAG_AMBER_UPTO} %` }} /><span>up to {RAG_AMBER_UPTO}% up</span>
            <TrendChip t={{ kind: 'down', pct: -8, rag: 'green', label: 'Lower than or the same as PY' }} /><span>lower / same</span>
            <TrendChip t={{ kind: 'new', pct: 100, rag: 'new', label: 'New this year - no spend in PY (counted as +100 %)' }} /><span>no spend in PY (= +100%)</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-2xs text-muted min-[1760px]:inline">Click a group heading for its G/L columns · any figure for the posting lines behind it</span>
          <Button size="sm" onClick={exportXlsx} title={`${ytd} vs ${pyYtd} · ${UNIT_LABEL[unit]}`}><Download size={14} /> Excel</Button>
        </div>
      </div>
      <div className="scroll-thin max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="mis w-max min-w-full border-separate border-spacing-0 text-[12px]" data-testid="mis-grid">
          <thead>
            <tr>
              <th rowSpan={2} className="stick min-w-[14rem] border-b border-r border-line px-3 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted" style={{ top: 0 }}>Item</th>
              {bands.map((b) => (
                <th key={b.key} colSpan={b.span} className={cx('border-b border-l border-line px-2 py-1.5 text-center text-2xs font-extrabold uppercase tracking-wide', b.key === 'mis' || b.key === 'lr' ? 'text-accent' : 'text-ink')} style={{ top: 0 }}>
                  {b.group && mode === 'mis' && b.group.gls.length > 0 ? (
                    <button type="button" onClick={() => toggleGroup(b.key)} className="inline-flex items-center gap-1 rounded px-1 hover:bg-sunken" aria-expanded={openGroups.has(b.key)} title={openGroups.has(b.key) ? 'Hide G/L columns' : `Show the ${b.group.gls.length} G/L columns`}>
                      {openGroups.has(b.key) ? <Minus size={11} /> : <Plus size={11} />} {b.label}
                    </button>
                  ) : b.label}
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c, i) => (
                <th key={c.id} className={cx('max-w-[9rem] border-b border-line px-2 py-1 text-right align-bottom font-semibold', (i === 0 || cols[i - 1].bandKey !== c.bandKey) && 'border-l', c.tone === 'gl' && 'bg-sunken')} style={{ top: 29 }}>
                  <div className={cx('whitespace-normal text-[11px] leading-tight', c.tone === 'gl' ? 'font-medium text-ink' : 'text-ink')} title={c.label}>{c.tone === 'gl' && c.label.length > 34 ? `${c.label.slice(0, 32)}…` : c.label}</div>
                  <div className="text-[10px] font-medium text-faint">{c.sub}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, li) => {
              const nm = nodeMeasures(l.node, groups);
              const canToggle = l.kind !== 'row' && l.kind !== 'grand' && l.node.level < 3 && l.node.children.length > 0;
              return (
                <tr key={`${l.node.id}|${l.kind}|${li}`} className={rowCls(l)}>
                  <td className={cx('stick border-r border-line px-3 py-1.5', l.kind === 'grand' ? 'bg-plum' : l.kind === 'total' && !l.collapsed ? 'bg-sunken' : 'bg-panel')} style={{ paddingLeft: 12 + l.depth * 14 }}>
                    <span className="flex items-center gap-1">
                      {canToggle ? (
                        <button type="button" onClick={() => toggle(l.node.id)} className="grid h-5 w-5 place-items-center rounded text-muted hover:bg-line" aria-label={l.collapsed ? `Open ${l.label}` : `Close ${l.node.label}`}>
                          {l.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                        </button>
                      ) : <span className="w-5" />}
                      {l.kind === 'row' ? (
                        <button type="button" className="max-w-[18rem] truncate text-left hover:text-accent hover:underline" title={`${l.label} · ${l.node.key}`} onClick={() => setCell({ label: l.label, keys: [l.node.key!], value: cyOf(nm.lr) })}>{l.label}</button>
                      ) : (
                        <span className={cx('max-w-[18rem] truncate', l.kind === 'header' && 'text-2xs font-extrabold uppercase tracking-wide text-accent')} title={l.label}>{l.label}</span>
                      )}
                    </span>
                  </td>
                  {l.kind === 'header'
                    ? <td colSpan={cols.length} />
                    : cols.map((c, i) => {
                      const v = c.value(l.node, nm);
                      const first = i === 0 || cols[i - 1].bandKey !== c.bandKey;
                      const isUt = c.id.endsWith('|ut');
                      if (c.kind === 'trend' && c.pair) {
                        return <td key={c.id} data-col="trend" className={cx('px-2 py-1 text-right', first && 'border-l border-line')}><TrendChip t={trendOf(...c.pair(l.node, nm))} /></td>;
                      }
                      const shown = v === null ? '–' : c.pct ? (isUt ? `${v.toFixed(1)}%` : pct(v)) : c.kind === 'var' && v >= 0.5 ? `+${fmt(v)}` : fmt(v);
                      const drill = c.drill && v ? c.drill : null;
                      const varTone = c.kind === 'var' && l.kind !== 'grand' && v !== null ? (v >= 0.5 ? 'text-bad' : v <= -0.5 ? 'text-good' : '') : '';
                      return (
                        <td key={c.id} data-col={c.tone === 'gl' ? 'gl' : c.kind === 'var' ? 'var' : undefined} className={cx('num px-2 py-1.5 text-right', first && 'border-l border-line', c.tone === 'total' && l.kind !== 'grand' && 'font-semibold', c.tone === 'budget' && l.kind !== 'grand' && 'text-muted', c.pct && v !== null && l.kind !== 'grand' && isUt && (v > 100 ? 'text-bad' : 'text-good'), varTone)}>
                          {drill ? (
                            <button type="button" data-drill={l.kind} title="Posting lines behind this figure" className={cx('rounded px-0.5 hover:underline', l.kind === 'grand' ? 'hover:bg-white/15' : 'hover:bg-accent/10 hover:text-accent')} onClick={() => drillInto(l, drill, v ?? 0)}>{shown}</button>
                          ) : shown}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Fragment>{cell && <DetailDrawer cell={cell} onClose={() => setCell(null)} />}</Fragment>
    </Card>
  );
}
