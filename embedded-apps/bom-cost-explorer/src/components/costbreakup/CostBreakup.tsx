'use client';
/**
 * "Cost breakup" (BOM costing result tab and Production plan tab): each finished good's cost in Raw Material, Perfume,
 * Pack Material, Total Material, Labour, Power, Machine, Steam and Conversion Charge, with quantity and cost (local and
 * INR). Conversion comes from SAP's routing activities (ActivityCostSet) of the FG and its semi-finished components;
 * the process-order actual per piece is shown next to it when SAP has that data set. Click an element for its detail:
 * the components behind a material element, the routing activities behind a conversion element. With several FGs
 * (plan, multi-FG run): the total over all FGs and the per-FG list; click an FG to open its breakup.
 */
import { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { D, ZERO, type Decimal } from '@/lib/cost/decimal';
import { buildBreakup, qtyText, sumBreakups, type BreakupLine, type ElementCell, type FgBreakup } from '@/lib/costbreakup/breakup';
import { CONVERSION_ELEMENTS, ELEMENT_LABEL, MATERIAL_ELEMENTS, type Element, type ProcOrderRow } from '@/lib/costbreakup/procOrder';
import { useProcOrders } from '@/lib/costbreakup/useProcOrders';
import { useActivities } from '@/lib/costbreakup/useActivities';
import { isLeafRow } from '@/lib/cost/tree';
import { exportTable, type XCol } from '@/lib/client/export';
import { fmtNum, fmtQty, fmtRate, fmtDate } from '@/lib/format';

/** Budat as SAP sends it (YYYYMMDD, YYYY-MM-DD or /Date(ms)/) -> YYYY-MM-DD for fmtDate. */
const budatIso = (v: string) => {
  const ms = /\/Date\((-?\d+)/.exec(v ?? '');
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
};
import { sourceLabel } from '@/lib/rates/sourceLabel';
import { Button, Card, Drawer, Empty, Pill, Segmented, cx } from '../ui';

const th = 'sticky top-0 z-10 bg-panel px-2 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted shadow-[0_1px_0_rgb(var(--line))]';
const thN = `${th} text-right`;
const td = 'px-2 py-1.5 align-top';
const tdN = `${td} num text-right whitespace-nowrap`;
const n4 = (d: Decimal | null | undefined) => (d ? Number(d.toFixed(4)) : null);
const pct = (a: Decimal, b: Decimal) => (b.isZero() ? null : a.div(b).times(100));

export interface CostBreakupProps<T extends BreakupLine> {
  lines: T[];
  qtyOf: (l: T) => Decimal;
  fgQtyOf: (l: T) => Decimal;
  /** "the explosion quantity" / "the plan quantity" - says what the FG quantity is */
  qtyLabel: string;
  /** the tab is visible (process orders load only then) */
  active?: boolean;
  exportName: string;
}

type Pick = { scope: 'all' } | { scope: 'fg'; key: string };
type Detail = { el: Element; fgKey: string | null };

export default function CostBreakup<T extends BreakupLine>({ lines, qtyOf, fgQtyOf, qtyLabel, active = true, exportName }: CostBreakupProps<T>) {
  const [months, setMonths] = useState(12);
  const plants = useMemo(() => [...new Set(lines.map((l) => l.Hwerks))], [lines]);
  const fgCodes = useMemo(() => [...new Set(lines.map((l) => l.Headmat))], [lines]);
  const po = useProcOrders(plants, fgCodes, months, active);
  const semis = useMemo(() => lines.filter((l) => !isLeafRow(l) && l.Idnrk && l.Idnrk !== l.Headmat), [lines]);
  const actPlants = useMemo(() => [...new Set([...plants, ...semis.map((l) => l.Werks || l.Hwerks)])], [plants, semis]);
  const actMats = useMemo(() => [...new Set([...fgCodes, ...semis.map((l) => l.Idnrk)])], [fgCodes, semis]);
  const act = useActivities(actPlants, actMats, active);
  const fgs = useMemo(() => buildBreakup(lines, qtyOf, fgQtyOf, po.actuals, act.perUnit), [lines, qtyOf, fgQtyOf, po.actuals, act.perUnit]);
  const showActual = po.status === 'ready';
  const all = useMemo(() => sumBreakups(fgs), [fgs]);
  const [pick, setPick] = useState<Pick>({ scope: 'all' });
  const [detail, setDetail] = useState<Detail | null>(null);
  const one = fgs.length === 1 ? fgs[0] : pick.scope === 'fg' ? fgs.find((f) => f.key === pick.key) ?? null : null;

  if (!fgs.length) return <Empty title="Nothing to break up" icon="▦">Run the costing first; the cost breakup is built from SAP&apos;s lines.</Empty>;

  const doExport = () => {
    const els = [...MATERIAL_ELEMENTS, ...CONVERSION_ELEMENTS];
    const cols: XCol[] = [
      { header: 'Country', get: (i) => fgs[i].land1 }, { header: 'Plant', get: (i) => fgs[i].hwerks }, { header: 'FG', get: (i) => fgs[i].headmat },
      { header: 'Description', width: 30, get: (i) => fgs[i].headtxt }, { header: 'FG qty', dp: 3, get: (i) => n4(fgs[i].fgQty) }, { header: 'Local curr', get: (i) => fgs[i].curr },
      ...els.flatMap((el): XCol[] => [
        { header: `${ELEMENT_LABEL[el]} qty`, width: 18, get: (i) => qtyText(fgs[i].elements[el].qty, (d) => d.toFixed(3)) },
        { header: `${ELEMENT_LABEL[el]} local`, dp: 2, get: (i) => n4(fgs[i].elements[el].loc) },
        { header: `${ELEMENT_LABEL[el]} INR`, dp: 2, curr: 'INR', get: (i) => n4(fgs[i].elements[el].inr) },
        { header: `${ELEMENT_LABEL[el]} actual / pc INR`, dp: 4, curr: 'INR', get: (i) => n4(fgs[i].elements[el].actualPcInr) },
      ]),
      { header: 'Total Material INR', dp: 2, curr: 'INR', get: (i) => n4(fgs[i].material.inr) },
      { header: 'Conversion INR', dp: 2, curr: 'INR', get: (i) => n4(fgs[i].conversion.inr) },
      { header: 'Total cost INR', dp: 2, curr: 'INR', get: (i) => n4(fgs[i].total.inr) },
      { header: 'Total cost / pc INR', dp: 4, curr: 'INR', get: (i) => n4(fgs[i].fgQty.gt(0) ? fgs[i].total.inr.div(fgs[i].fgQty) : null) },
      { header: 'Total cost / pc local', dp: 4, get: (i) => n4(fgs[i].fgQty.gt(0) ? fgs[i].total.loc.div(fgs[i].fgQty) : null) },
      { header: 'Routings with activities', get: (i) => fgs[i].activity.filter((u) => u.act && u.unitOk).length },
      { header: 'Process orders', get: (i) => fgs[i].actual?.orders ?? 0 },
    ];
    void exportTable({ fmt: 'xlsx', name: exportName, cols, count: fgs.length, extraParams: [['FG quantity', qtyLabel], ['Material', 'Leaf components by type: ROH = Raw Material (group 106 = Perfume), PKGN / VERP = Pack Material'], ['Conversion', `SAP routing activities (ActivityCostSet) of the FG and its semi-finished components, period ${act.period.poper}/${act.period.gjahr}, x their quantity`], ['Activity rows', act.status === 'ready' ? `${act.rows.length}` : act.note || act.status], ['Process orders', po.status === 'ready' ? `${po.rows.length} rows (last ${months} months)` : po.note || po.status]] });
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">{fgs.length} finished good{fgs.length === 1 ? '' : 's'} · FG quantity = {qtyLabel}</span>
        <span className="text-muted">· Conversion: SAP activity cost, period {act.period.poper}/{act.period.gjahr}</span>
        <ActivityNote status={act.status} note={act.note} rows={act.rows.length} priced={act.rows.some((r) => D(r.ActPrice).gt(0) || D(r.ActValue).gt(0))} period={`${act.period.poper}/${act.period.gjahr}`} />
        {showActual && (
          <>
            <span className="text-muted">· Process orders:</span>
            <div className="w-48"><Segmented<number> size="sm" label="Process orders period" value={months} onChange={setMonths} options={[{ value: 3, label: '3 mo' }, { value: 6, label: '6 mo' }, { value: 12, label: '12 mo' }]} /></div>
            <Pill tone={po.rows.length ? 'good' : 'neutral'}>{po.rows.length ? `${po.rows.length.toLocaleString('en-IN')} rows` : 'no orders in the period'}</Pill>
          </>
        )}
        <Button size="sm" className="ml-auto" onClick={doExport}><FileSpreadsheet size={14} /> Excel</Button>
      </div>

      {fgs.length > 1 && (
        <Card title={pick.scope === 'all' ? `All ${fgs.length} finished goods` : 'Finished goods'} bodyClass="p-0">
          <div className="scroll-thin max-h-[38vh] overflow-auto">
            <table className="w-full text-xs">
              <thead><tr><th className={th}>FG</th><th className={thN}>FG qty</th><th className={thN}>Total Material INR</th><th className={thN}>Conversion INR</th><th className={thN}>Total cost INR</th><th className={thN}>Cost / pc INR</th><th className={thN}>Cost / pc local</th>{showActual && <th className={thN}>Process orders</th>}</tr></thead>
              <tbody>
                <tr className={cx('cursor-pointer border-t border-line/60 font-semibold hover:bg-sunken', pick.scope === 'all' && 'bg-accent/[0.06]')} onClick={() => setPick({ scope: 'all' })}>
                  <td className={td}>All finished goods</td><td className={tdN} /><td className={tdN}>{fmtNum(all.material.inr, 2)}</td><td className={tdN}>{fmtNum(all.conversion.inr, 2)}</td><td className={tdN}>{fmtNum(all.total.inr, 2)}</td><td className={tdN} /><td className={tdN} />{showActual && <td className={tdN} />}
                </tr>
                {fgs.map((f) => (
                  <tr key={f.key} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', pick.scope === 'fg' && pick.key === f.key && 'bg-accent/[0.06]')} onClick={() => setPick({ scope: 'fg', key: f.key })}>
                    <td className={td}><span className="font-mono font-semibold">{f.headmat}</span> <span className="text-muted">{f.headtxt}</span><div className="text-2xs text-faint">{f.land1} · {f.hwerks}</div></td>
                    <td className={tdN}>{fmtQty(f.fgQty)}</td><td className={tdN}>{fmtNum(f.material.inr, 2)}</td><td className={tdN}>{f.conversion.inr.isZero() ? '—' : fmtNum(f.conversion.inr, 2)}</td>
                    <td className={cx(tdN, 'font-semibold')}>{fmtNum(f.total.inr, 2)}</td><td className={tdN}>{f.fgQty.gt(0) ? fmtRate(f.total.inr.div(f.fgQty)) : '—'}</td><td className={tdN}>{f.fgQty.gt(0) ? <>{fmtRate(f.total.loc.div(f.fgQty))} <span className="text-2xs text-faint">{f.curr}</span></> : '—'}</td>{showActual && <td className={tdN}>{f.actual?.orders ?? 0}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {one ? (
        <ElementTable title={`${one.headmat} ${one.headtxt} · ${one.hwerks} · ${fmtQty(one.fgQty)} pc`} cells={one.elements} material={one.material} conversion={one.conversion} total={one.total} curr={one.curr} fgQty={one.fgQty} actualOrders={showActual ? one.actual?.orders ?? 0 : null} showActual={showActual} onOpen={(el) => setDetail({ el, fgKey: one.key })} />
      ) : (
        <ElementTable title={`All ${fgs.length} finished goods`} cells={all.elements} material={all.material} conversion={all.conversion} total={all.total} curr={all.curr} fgQty={null} actualOrders={null} showActual={showActual} onOpen={(el) => setDetail({ el, fgKey: null })} />
      )}

      <p className="text-2xs text-muted">Material elements come from SAP&apos;s costing: each component by its material type - ROH = Raw Material (material group 106 = Perfume), PKGN / VERP = Pack Material - at its landed cost. Machine, Labour, Power and Steam are SAP&apos;s routing activities (ActivityCostSet, period {act.period.poper}/{act.period.gjahr}) of the FG and of its semi-finished / bulk components, per BOM unit x their quantity; other activity types count as Conversion Charge. Costs in the plant currency, and in INR. Click an element for its detail.</p>

      {detail && <DetailDrawer detail={detail} fgs={fgs} lines={lines} qtyOf={qtyOf} period={`${act.period.poper}/${act.period.gjahr}`} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ActivityNote({ status, note, rows, priced, period }: { status: string; note: string; rows: number; priced: boolean; period: string }) {
  if (status === 'loading') return <span className="text-muted">loading…</span>;
  if (status === 'ready' && rows && !priced) return <span className="font-semibold text-warn">SAP has no activity prices for period {period} on this system: quantities only, cost 0</span>;
  if (status === 'ready') return <Pill tone={rows ? 'good' : 'neutral'}>{rows ? `${rows.toLocaleString('en-IN')} activity rows` : 'no activities in SAP for these materials'}</Pill>;
  if (status === 'missing') return <span className="text-warn" title={note}>{note}</span>;
  if (status === 'error') return <span className="text-bad">{note}</span>;
  return null;
}

function ElementTable({ title, cells, material, conversion, total, curr, fgQty, actualOrders, showActual, onOpen }: {
  title: string; cells: Record<Element, ElementCell>; material: { loc: Decimal | null; inr: Decimal }; conversion: { loc: Decimal | null; inr: Decimal }; total: { loc: Decimal | null; inr: Decimal };
  curr: string | null; fgQty: Decimal | null; actualOrders: number | null; showActual: boolean; onOpen: (el: Element) => void;
}) {
  const perPc = (v: Decimal) => (fgQty && fgQty.gt(0) ? v.div(fgQty) : null);
  /** local currency other than INR: per piece in that currency too */
  const locPc = !!curr && curr !== 'INR' && !!fgQty;
  const row = (el: Element) => {
    const c = cells[el];
    if (el === 'OTHER' && c.inr.isZero() && c.source === 'none') return null;
    const pc = perPc(c.inr);
    const diff = pc && c.source !== 'none' && c.actualPcInr ? pct(pc.minus(c.actualPcInr), c.actualPcInr) : null;
    return (
      <tr key={el} className="cursor-pointer border-t border-line/60 hover:bg-sunken" onClick={() => onOpen(el)} title="Click for the detail">
        <td className={cx(td, 'pl-5 font-semibold text-accent underline-offset-2 hover:underline')}>{ELEMENT_LABEL[el]}</td>
        <td className={cx(td, 'num')}>{qtyText(c.qty, (d) => fmtQty(d))}</td>
        <td className={tdN}>{c.source === 'none' ? '—' : curr ? `${fmtNum(c.loc, 2)} ${curr}` : '—'}</td>
        <td className={tdN}>{c.source === 'none' ? '—' : fmtNum(c.inr, 2)}</td>
        {locPc && <td className={tdN}>{c.source !== 'none' && perPc(c.loc) ? fmtRate(perPc(c.loc)!) : '—'}</td>}
        <td className={tdN}>{pc && c.source !== 'none' ? fmtRate(pc) : '—'}</td>
        <td className={tdN}>{total.inr.gt(0) && c.source !== 'none' ? `${fmtNum(c.inr.div(total.inr).times(100), 1)}%` : '—'}</td>
        {showActual && <td className={tdN}>{c.actualPcInr ? fmtRate(c.actualPcInr) : '—'}</td>}
        {showActual && <td className={cx(tdN, diff && diff.gt(0) ? 'text-bad' : diff && diff.lt(0) ? 'text-good' : '')}>{diff ? `${diff.gt(0) ? '+' : ''}${fmtNum(diff, 1)}%` : '—'}</td>}
      </tr>
    );
  };
  const sum = (label: string, v: { loc: Decimal | null; inr: Decimal }, strong = false) => (
    <tr className={cx('border-t border-line', strong ? 'bg-accent/[0.06] font-extrabold' : 'bg-sunken/50 font-bold')}>
      <td className={td}>{label}</td><td className={td} />
      <td className={tdN}>{v.loc && curr ? `${fmtNum(v.loc, 2)} ${curr}` : '—'}</td><td className={tdN}>{fmtNum(v.inr, 2)}</td>
      {locPc && <td className={tdN}>{v.loc && perPc(v.loc) ? fmtRate(perPc(v.loc)!) : '—'}</td>}
      <td className={tdN}>{perPc(v.inr) ? fmtRate(perPc(v.inr)!) : '—'}</td><td className={tdN}>{total.inr.gt(0) ? `${fmtNum(v.inr.div(total.inr).times(100), 1)}%` : '—'}</td>{showActual && <><td className={tdN} /><td className={tdN} /></>}
    </tr>
  );
  return (
    <Card title={`Cost breakup · ${title}`} actions={actualOrders !== null ? <span className="text-2xs text-muted">{actualOrders} process order{actualOrders === 1 ? '' : 's'}</span> : undefined} bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th className={th}>Cost element</th><th className={th}>Qty</th><th className={thN}>Cost (local)</th><th className={thN}>Cost INR</th>{locPc && <th className={thN}>Per piece {curr}</th>}<th className={thN}>Per piece INR</th><th className={thN}>Share</th>{showActual && <><th className={thN} title="New cost type: process-order actual per FG piece">Process order actual / pc</th><th className={thN}>vs actual</th></>}</tr></thead>
          <tbody>
            {MATERIAL_ELEMENTS.map(row)}
            {sum('Total Material (Raw Material + Perfume + Pack Material)', material)}
            {CONVERSION_ELEMENTS.map(row)}
            {sum('Total Conversion', conversion)}
            {sum('Total Cost', total, true)}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DetailDrawer<T extends BreakupLine>({ detail, fgs, lines, qtyOf, period, onClose }: { detail: Detail; fgs: FgBreakup[]; lines: T[]; qtyOf: (l: T) => Decimal; period: string; onClose: () => void }) {
  const scope = detail.fgKey ? fgs.filter((f) => f.key === detail.fgKey) : fgs;
  const isMaterial = MATERIAL_ELEMENTS.includes(detail.el);
  const label = ELEMENT_LABEL[detail.el];
  const matRows = isMaterial ? scope.flatMap((f) => f.lines[detail.el].map((i) => ({ f, l: lines[i] }))).sort((a, b) => D(b.l.TotCostInr).cmp(D(a.l.TotCostInr))) : [];
  const poRows: { f: FgBreakup; r: ProcOrderRow }[] = isMaterial ? [] : scope.flatMap((f) => (f.actual?.byElement[detail.el]?.rows ?? []).map((r) => ({ f, r })));
  const poMat: { f: FgBreakup; r: ProcOrderRow }[] = isMaterial ? scope.flatMap((f) => (f.actual?.byElement[detail.el]?.rows ?? []).map((r) => ({ f, r }))) : [];
  const total = matRows.reduce((a, x) => a.plus(D(x.l.TotCostInr)), ZERO);
  return (
    <Drawer open onClose={onClose} width={1120} title={`${label} · ${detail.fgKey ? `${scope[0].headmat} ${scope[0].headtxt}` : `all ${fgs.length} finished goods`}`}>
      {isMaterial ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-xs text-muted">{matRows.length} component line{matRows.length === 1 ? '' : 's'} from SAP&apos;s costing · {fmtNum(total, 2)} INR</p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Component</th>{!detail.fgKey && <th className={th}>FG</th>}<th className={th}>Plant</th><th className={th}>Type / group</th><th className={thN}>Qty</th><th className={th}>Source</th><th className={thN}>Rate / unit INR</th><th className={thN}>Cost INR</th></tr></thead>
              <tbody>
                {matRows.map(({ f, l }, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className={td}><span className="font-mono font-semibold">{l.Idnrk}</span> <span className="text-muted">{l.Maktx}</span></td>
                    {!detail.fgKey && <td className={cx(td, 'font-mono')}>{f.headmat}</td>}
                    <td className={td}>{l.Werks || l.Hwerks}</td><td className={td}>{l.Mtart} / {l.Matkl}</td>
                    <td className={tdN}>{fmtQty(qtyOf(l))} {l.Meins}</td><td className={td}>{l.SelSource ? sourceLabel(l.SelSource) : 'no rate'}</td>
                    <td className={tdN}>{fmtRate(l.SelRatePcInr)}</td><td className={cx(tdN, 'font-semibold')}>{fmtNum(D(l.TotCostInr), 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {poMat.length > 0 && <PoTable title={`${label} in the process orders (actual)`} rows={poMat} showFg={!detail.fgKey} />}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <ActivityTable el={detail.el} scope={scope} showFg={!detail.fgKey} period={period} />
          {poRows.length > 0 && <PoTable title={`${label} in the process orders (actual)`} rows={poRows} showFg={!detail.fgKey} />}
        </div>
      )}
    </Drawer>
  );
}

/** The routing activities behind one conversion element: per FG and semi-finished routing, each activity type. */
function ActivityTable({ el, scope, showFg, period }: { el: Element; scope: FgBreakup[]; showFg: boolean; period: string }) {
  const rows = scope.flatMap((f) => f.activity.flatMap((u) => (u.act?.lines ?? []).filter((x) => x.el === el).map((x) => {
    const loc = x.valuePerUnit.times(u.qty);
    const inr = (x.valuePerUnitInr ?? (f.inrPerLoc ? x.valuePerUnit.times(f.inrPerLoc) : null))?.times(u.qty) ?? null;
    return { f, u, x, loc, inr };
  })));
  const skipped = scope.flatMap((f) => f.activity.filter((u) => u.act && !u.unitOk && u.act.byElement[el]).map((u) => ({ f, u })));
  const fromPo = scope.filter((f) => f.elements[el].source === 'process orders');
  const total = rows.filter((r) => r.u.unitOk).reduce((a, r) => a.plus(r.inr ?? ZERO), ZERO);
  if (!rows.length) {
    return <p className="text-muted">{fromPo.length ? `No ${ELEMENT_LABEL[el].toLowerCase()} in SAP's routing activities; the figure is the process-order actual.` : `No ${ELEMENT_LABEL[el].toLowerCase()} activity in SAP's routings (ActivityCostSet, period ${period}) for this FG or its semi-finished components.`}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{ELEMENT_LABEL[el]} from SAP&apos;s routing activities, period {period}: {rows.length} activit{rows.length === 1 ? 'y' : 'ies'} · {fmtNum(total, 2)} INR. Activity quantity and value are SAP&apos;s for the BOM base quantity; the app divides by it and multiplies by the material&apos;s quantity.</p>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
        <table className="w-full text-xs">
          <thead><tr>{showFg && <th className={th}>FG</th>}<th className={th}>Routing of</th><th className={th}>Operation / resource</th><th className={th}>Activity</th><th className={th}>Cost centre</th><th className={thN}>Activity / BOM qty</th><th className={thN}>Price</th><th className={thN}>Value / unit</th><th className={thN}>Material qty</th><th className={thN}>Cost (local)</th><th className={thN}>Cost INR</th></tr></thead>
          <tbody>
            {rows.map(({ f, u, x, loc, inr }, i) => (
              <tr key={i} className={cx('border-t border-line/60', !u.unitOk && 'text-faint line-through')}>
                {showFg && <td className={cx(td, 'font-mono')}>{f.headmat}</td>}
                <td className={td}><span className="font-mono font-semibold">{u.matnr}</span> <span className="text-muted">{u.maktx}</span><div className="text-2xs text-faint">{u.level} · {u.werks} · alt. BOM {u.act?.stlal}</div></td>
                <td className={td}>{x.row.Vornr} {x.row.Resrc}<div className="text-2xs text-faint">{x.row.ResrcTxt}</div></td>
                <td className={td}><span className="font-mono">{x.row.Lstar}</span> <span className="text-muted">{x.row.ActName}</span></td>
                <td className={td}>{x.row.Kostl}</td>
                <td className={tdN}>{fmtQty(x.row.ActQty)} {x.row.ActUnit} / {fmtQty(x.row.BomQty)} {x.row.BomUnit}</td>
                <td className={tdN}>{D(x.row.ActPrice).gt(0) ? fmtRate(x.row.ActPrice) : <span className="text-warn">no price</span>}</td>
                <td className={tdN}>{fmtRate(x.valuePerUnit)} <span className="text-2xs text-faint">{f.curr}/{x.row.BomUnit}</span></td>
                <td className={tdN}>{fmtQty(u.qty)} {u.unit}</td>
                <td className={tdN}>{fmtNum(loc, 2)} {f.curr}</td>
                <td className={cx(tdN, 'font-semibold')}>{inr ? fmtNum(inr, 2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skipped.length > 0 && <p className="text-2xs text-warn">Not added (struck through): {skipped.map(({ u }) => `${u.matnr} - BOM line in ${u.unit}, routing in ${u.act!.bomUnit}`).join('; ')}.</p>}
    </div>
  );
}

function PoTable({ title, rows, showFg }: { title: string; rows: { f: FgBreakup; r: ProcOrderRow }[]; showFg: boolean }) {
  const orders = new Map<string, string>();
  rows.forEach(({ r }) => orders.set(r.Aufnr, r.Yield));
  const yieldSum = [...orders.values()].reduce((a, v) => a.plus(D(v)), ZERO);
  const cost = rows.reduce((a, { r }) => a.plus(D(r.CostInr).gt(0) || r.Waers !== 'INR' ? D(r.CostInr) : D(r.Cost)), ZERO);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">{title}: {orders.size} order{orders.size === 1 ? '' : 's'} · {fmtNum(cost, 2)} INR{yieldSum.gt(0) ? ` · ${fmtRate(cost.div(yieldSum))} INR per FG piece over ${fmtQty(yieldSum)} pc` : ''}</p>
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-line">
        <table className="w-full text-xs">
          <thead><tr><th className={th}>Order</th>{showFg && <th className={th}>FG</th>}<th className={th}>Posted</th><th className={th}>Activity / component</th><th className={th}>Cost centre</th><th className={thN}>Qty</th><th className={thN}>Cost</th><th className={thN}>Cost INR</th><th className={thN}>Order yield</th></tr></thead>
          <tbody>
            {rows.map(({ f, r }, i) => (
              <tr key={i} className="border-t border-line/60">
                <td className={cx(td, 'font-mono')}>{r.Aufnr}</td>{showFg && <td className={cx(td, 'font-mono')}>{f.headmat}</td>}
                <td className={td}>{fmtDate(budatIso(r.Budat))}</td><td className={td}>{r.Lstar || r.Idnrk} {r.Maktx && <span className="text-muted">{r.Maktx}</span>}</td><td className={td}>{r.Kostl}</td>
                <td className={tdN}>{fmtQty(r.Menge)} {r.Meins}</td><td className={tdN}>{fmtNum(D(r.Cost), 2)} {r.Waers}</td><td className={tdN}>{fmtNum(D(r.CostInr), 2)}</td><td className={tdN}>{fmtQty(r.Yield)} {r.YieldUom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
