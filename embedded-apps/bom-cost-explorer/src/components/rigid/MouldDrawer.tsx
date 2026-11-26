'use client';
/**
 * Mould details of a rigid packing item: the output of transaction ZRIGID (read-only, per mould and vendor), with the vendor comparison, utilisation, saved rates,
 * alerts and a what-if. Nothing is posted to SAP (no info record, no ZMM_RIGID_COST write). "Apply to BOM simulation" only fills the cockpit's own manual override.
 */
import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { FileSpreadsheet } from 'lucide-react';
import { Button, Drawer, Spinner, Tabs, cx, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import AiNarrateSlot from '../ai/AiNarrateSlot';
import { fetchRigid } from '@/lib/rigid/service';
import { RIGID_FIELDS } from '@/lib/rigid/fields';
import { budgetPerPiece, parseBudget, parseHistory, rigidAlerts, utilisation, type BudgetBreakup, type HistoryLine } from '@/lib/rigid/analysis';
import { baseWhatIf, buildUp, dd, parseCalc, polymerImpact, sensitivity, simulate, strip0, vendorCompare, type RigidCalc, type WhatIf, type UsageLine } from '@/lib/rigid/model';
import { rigidSheets } from '@/lib/rigid/export';
import { downloadWacWorkbook } from '@/lib/wac/export';
import { rigidSpec } from '@/lib/ai/builders/screens';
import type { RigidRow } from '@/lib/rigid/fields';
import { tdCls, thCls } from '../dash/parts';
import type { CockpitRate, RigidItem } from './CostBreakupDrawer';

type Tab = 'build' | 'vendors' | 'comps' | 'util' | 'history' | 'whatif' | 'alerts';
const f = (d: Decimal | null | undefined, dp = 2) => (d ? d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '-');
const sgn = (d: Decimal | null, dp = 2) => (d ? `${d.gt(0) ? '+' : ''}${f(d, dp)}` : '-');
const SEV = { high: 'bg-bad/15 text-bad', medium: 'bg-warn/15 text-warn', info: 'bg-accent/10 text-accent' } as const;
void RIGID_FIELDS;

interface Data { rows: RigidRow[]; calc: RigidCalc; budget: BudgetBreakup; history: HistoryLine[]; notes: string[] }

export default function MouldDrawer({ item, cockpit, onApply, onClose }: { item: RigidItem; cockpit: CockpitRate; /** fills the manual override of the BOM line (rate per piece); omitted = no apply button */ onApply?: (ratePc: string) => void; onClose: () => void }) {
  const [plant, setPlant] = useState(item.werks);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('build');
  const [mk, setMk] = useState('');
  const [wi, setWi] = useState<WhatIf | null>(null);
  const [usage, setUsage] = useState<UsageLine[] | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [poly, setPoly] = useState('');
  const [polyPct, setPolyPct] = useState('10');

  async function load(w: string) {
    const p = w.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(p)) { setError('Enter the 4 character plant where the packing item has its BOM.'); return; }
    setBusy(true); setError(''); setData(null); setUsage(null);
    const q = { matnr: [item.matnr], werks: p };
    const [c, b, h] = await Promise.allSettled([fetchRigid(q), fetchRigid({ ...q, mode: 'B' }), fetchRigid({ ...q, mode: 'H' })]);
    const notes: string[] = [];
    if (c.status === 'rejected') { setError(errorText(c.reason)); setBusy(false); return; }
    if (b.status === 'rejected') notes.push(`Budget not available: ${errorText(b.reason)}`);
    if (h.status === 'rejected') notes.push(`Saved rates not available: ${errorText(h.reason)}`);
    const calc = parseCalc(c.value.rows);
    setData({ rows: c.value.rows, calc, budget: parseBudget(b.status === 'fulfilled' ? b.value.rows : []), history: parseHistory(h.status === 'fulfilled' ? h.value.rows : []), notes });
    setMk(calc.moulds[0]?.key ?? ''); setWi(calc.moulds[0] ? baseWhatIf(calc.moulds[0]) : null); setPoly(calc.moulds[0]?.comps[0]?.Comp ?? '');
    setBusy(false);
  }
  useEffect(() => { void load(item.werks); }, [item.matnr, item.werks]); // eslint-disable-line react-hooks/exhaustive-deps

  const mould = data?.calc.moulds.find((m) => m.key === mk) ?? data?.calc.moulds[0] ?? null;
  const vendors = useMemo(() => (data ? vendorCompare(data.calc) : []), [data]);
  const budPc = useMemo(() => (data ? budgetPerPiece(data.budget) : null), [data]);
  const budQty = data?.budget.d[0]?.budqty && data.budget.d[0].budqty.gt(0) ? data.budget.d[0].budqty : null;
  const util = useMemo(() => (data ? utilisation(data.calc, budQty) : []), [data, budQty]);
  const alerts = useMemo(() => (data ? rigidAlerts({ calc: data.calc, budget: data.budget, history: data.history, cockpitRatePc: cockpit.ratePc }) : []), [data, cockpit.ratePc]);
  const sim = mould && wi ? simulate(mould, wi) : null;
  const sapLanded = mould?.landed ?? null;
  const sens = useMemo(() => (mould ? sensitivity(mould) : []), [mould]);
  const lines = mould ? buildUp(mould.row) : [];
  const lineTotal = lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const lastSaved = data?.history[0]?.landed ?? null;
  const setW = (p: Partial<WhatIf>) => setWi((w) => (w ? { ...w, ...p } : w));
  const pickMould = (k: string) => { setMk(k); const m = data?.calc.moulds.find((x) => x.key === k); if (m) { setWi(baseWhatIf(m)); setPoly(m.comps[0]?.Comp ?? ''); setUsage(null); } };

  async function findUsage() {
    if (!poly) return;
    setUsageBusy(true);
    try { setUsage(polymerImpact((await fetchRigid({ matnr: [poly], werks: plant, mode: 'U' })).rows, dd(polyPct), dd(mould?.comps.find((c) => c.Comp === poly)?.Zpbr))); }
    catch (e) { setError(errorText(e)); }
    setUsageBusy(false);
  }
  async function exportXlsx() {
    if (!data) return;
    const wiRows = sim && mould ? [{ label: 'Mould', value: `${strip0(mould.row.Mould)} ${mould.row.MouldTxt}` }, { label: 'Vendor', value: mould.row.Vendor }, { label: 'SAP landed per 1000', value: f(sapLanded, 0) }, { label: 'What-if landed per 1000', value: f(sim.landedRounded, 0) }, { label: 'What-if landed per piece', value: f(sim.perPiece, 4) }, { label: 'Resin per 1000', value: f(sim.mat) }, { label: 'Conversion per 1000', value: f(sim.conv) }] : undefined;
    await downloadWacWorkbook(rigidSheets({ vendors, moulds: data.calc.moulds, budget: data.budget, history: data.history, util, alerts, whatIf: wiRows }), [['Item', `${item.matnr.replace(/^0+/, '')} ${item.maktx}`], ['Plant', plant], ['Source', 'ZRIGID (read-only simulation)']], `rigid-${item.matnr.replace(/^0+/, '')}`);
  }
  const best = vendors[0];
  const spec = () => (data && best && mould ? rigidSpec({ item: item.matnr.replace(/^0+/, ''), plant, vendors, alerts, cockpitRatePc: cockpit.ratePc, budgetPc: budPc, lastSaved,
    resinShare: best.landed.gt(0) ? best.mat.div(best.landed).times(100) : null, convShare: best.landed.gt(0) ? best.conv.div(best.landed).times(100) : null }) : null);

  const num = (k: keyof WhatIf, label: string, hint?: string) => (
    <label key={k} className="text-2xs font-bold">{label}
      <input className={cx(inputCls, 'mt-0.5 block w-full text-right text-xs', wi && mould && wi[k] !== baseWhatIf(mould)[k] && 'border-sim bg-sim/10')} inputMode="decimal" title={hint} value={wi ? String(wi[k]) : ''} onChange={(e) => setW({ [k]: e.target.value.replace(',', '.') } as Partial<WhatIf>)} />
    </label>
  );

  return (
    <Drawer open onClose={onClose} width={1100} title={<div><div className="text-sm font-bold">Mould details (ZRIGID): <span className="font-mono">{item.matnr.replace(/^0+/, '')}</span> {item.maktx}</div><div className="text-2xs text-muted">Bottom-up rate of the rigid packing item per mould and vendor, per 1000 pieces · read-only simulation, nothing is posted to SAP</div></div>}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold">Plant of the BOM
          <input className={cx(inputCls, 'mt-1 block w-24 uppercase')} maxLength={4} value={plant} onChange={(e) => setPlant(e.target.value)} /></label>
        <Button onClick={() => void load(plant)} disabled={busy}>{busy ? 'Reading…' : 'Reload'}</Button>
        {data && <Button onClick={() => void exportXlsx()}><FileSpreadsheet size={14} /> Excel</Button>}
        {data && <AiNarrateSlot build={spec} label="Explain this rate with AI" />}
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
      {data?.notes.map((n) => <p key={n} className="mt-1 text-2xs text-muted">{n}</p>)}
      {data && !data.calc.moulds.length && (
        <div className="mt-3 flex flex-col gap-1.5">{data.calc.errors.length === 0 && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">ZRIGID has no mould for this material in plant {plant}.</p>}
          {data.calc.errors.map((e) => <p key={e.Rowid} className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs"><span className="font-bold">{strip0(e.Mould) || strip0(e.Matnr)}</span>: {e.Msg || e.Flag}</p>)}</div>
      )}
      {data && mould && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold">Mould and vendor
              <select className={cx(inputCls, 'ml-2 w-[28rem] max-w-full')} value={mould.key} onChange={(e) => pickMould(e.target.value)}>
                {data.calc.moulds.map((m) => <option key={m.key} value={m.key}>{strip0(m.row.Mould)} {m.row.MouldTxt} · {m.row.Vendor || strip0(m.row.Lifnr)} · {f(m.landed, 0)}</option>)}
              </select></label>
          </div>
          <Tabs<Tab> label="Mould details" value={tab} onChange={setTab} tabs={[{ id: 'build', label: 'Build-up' }, { id: 'vendors', label: 'Vendors', badge: vendors.length }, { id: 'comps', label: 'Components' }, { id: 'util', label: 'Utilisation' }, { id: 'history', label: 'Saved rates', badge: data.history.length }, { id: 'whatif', label: 'What-if' }, { id: 'alerts', label: 'Alerts', badge: alerts.length }]} />

          {tab === 'build' && (
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                {([['Design', `${mould.row.Mds} ${mould.row.Design}`.trim()], ['Mould category', mould.row.McatTxt], ['Machine', `${mould.row.Mach} ${mould.row.MachTxt}`.trim()], ['Vendor', `${strip0(mould.row.Lifnr)} ${mould.row.Vendor}`.trim()],
                  ['Cavities', f(dd(mould.row.RunCavity), 0)], ['Cycle time (s)', f(dd(mould.row.CycTime), 2)], ['Hours per day', f(dd(mould.row.HoursDay), 1)], ['Efficiency %', f(dd(mould.row.FacProd), 1)],
                  ['Output per day', f(dd(mould.row.TotOut), 0)], ['Machine-day rate (ZMRT)', f(dd(mould.row.Zmrt), 2)], ['Asset value', f(dd(mould.row.Kansw), 0)], ['Depreciation', f(dd(mould.row.Nafag), 0)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-2xs text-faint">{k}</dt><dd className="num truncate">{v || <span className="text-faint">-</span>}</dd></div>))}
              </dl>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Cost line</th><th className={thCls}>Per 1000 pcs</th><th className={thCls}>Per piece</th><th className={thCls}>Share</th></tr></thead>
                  <tbody>{lines.map((l) => (
                    <tr key={l.key} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs">{l.label}</td><td className={tdCls}>{f(l.amount)}</td><td className={tdCls}>{f(l.amount.div(1000), 4)}</td>
                      <td className={tdCls}><span className="inline-block h-1.5 rounded-full bg-accent align-middle" style={{ width: `${Math.max(2, lineTotal.gt(0) ? l.amount.div(lineTotal).times(60).toNumber() : 0)}px` }} /> {lineTotal.gt(0) ? l.amount.div(lineTotal).times(100).toFixed(1) : '0'} %</td></tr>))}</tbody>
                  <tfoot><tr className="border-t border-line bg-line/20 font-extrabold"><td className="px-2.5 py-1.5 text-left text-xs">Landed rate (rounded by SAP)</td><td className={tdCls}>{f(mould.landed, 0)}</td><td className={tdCls}>{f(mould.landed.div(1000), 4)}</td><td className={tdCls} /></tr></tfoot></table>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {([['ZRIGID landed / pc', mould.landed.div(1000)], ['Used in this costing / pc', cockpit.ratePc], ['Budget landed / pc', budPc], ['Last saved by ZRIGID / pc', lastSaved ? lastSaved.div(1000) : null]] as [string, Decimal | null][]).map(([k, v], i) => (
                  <div key={k} className="rounded-xl border border-line p-2.5"><div className="text-2xs font-bold uppercase text-muted">{k}</div><div className="num text-base font-extrabold">{f(v, 4)}</div>
                    {i > 0 && v && v.gt(0) && <div className={cx('text-2xs', mould.landed.div(1000).gt(v) ? 'text-bad' : 'text-good')}>ZRIGID is {sgn(mould.landed.div(1000).minus(v).div(v).times(100), 1)} % against this</div>}</div>))}
              </div>
            </div>
          )}

          {tab === 'vendors' && (
            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[900px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Mould</th><th className={cx(thCls, '!text-left')}>Vendor</th><th className={cx(thCls, '!text-left')}>Machine</th><th className={thCls}>Output / day</th><th className={thCls}>Resin / 1000</th><th className={thCls}>Conversion / 1000</th><th className={thCls}>Landed / 1000</th><th className={thCls}>Landed / pc</th><th className={thCls}>Against cheapest</th></tr></thead>
                <tbody>{vendors.map((v) => (
                  <tr key={v.key} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', v.key === mould.key && 'bg-sunken')} onClick={() => pickMould(v.key)}>
                    <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{v.mould}</span> <span className="text-muted">{v.mouldTxt}</span></td><td className="px-2.5 py-1.5 text-left text-xs">{v.vendor || v.lifnr}</td><td className="px-2.5 py-1.5 text-left text-xs">{v.machine}</td>
                    <td className={tdCls}>{f(v.output, 0)}</td><td className={tdCls}>{f(v.mat)}</td><td className={tdCls}>{f(v.conv)}</td><td className={cx(tdCls, 'font-bold')}>{f(v.landed, 0)}</td><td className={tdCls}>{f(v.landed.div(1000), 4)}</td>
                    <td className={cx(tdCls, v.cheapest ? 'text-good' : 'text-bad')}>{v.cheapest ? 'cheapest' : `${sgn(v.diff, 0)} (${sgn(v.diffPct, 1)} %)`}</td></tr>))}</tbody></table>
              <p className="p-2 text-2xs text-muted">Click a row to open that mould and vendor. The same mould at another vendor changes conversion (machine-day rate and output), box and freight conditions.</p>
            </div>
          )}

          {tab === 'comps' && (
            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={thCls}>BOM qty</th><th className={thCls}>Scrap %</th><th className={thCls}>Qty with scrap</th><th className={thCls}>Share %</th><th className={thCls}>Rate (ZPBR)</th><th className={thCls}>Cost / 1000</th></tr></thead>
                <tbody>{mould.comps.map((c) => (
                  <tr key={c.Rowid} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{strip0(c.Comp)}</span> <span className="text-muted">{c.CompTxt}</span>{dd(c.Zpbr).isZero() && <span className="ml-1 rounded-full bg-warn/15 px-1.5 text-2xs font-bold text-warn">no rate</span>}</td>
                    <td className={tdCls}>{f(dd(c.BomQty), 4)}</td><td className={tdCls}>{f(dd(c.ScrapPct), 2)}</td><td className={tdCls}>{f(dd(c.CompQty), 4)}</td><td className={tdCls}>{f(dd(c.DosPerc), 1)}</td><td className={tdCls}>{f(dd(c.Zpbr), 4)}</td><td className={cx(tdCls, 'font-bold')}>{f(dd(c.CompCost), 2)}</td></tr>))}</tbody></table>
            </div>
          )}

          {tab === 'util' && (
            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[860px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Mould</th><th className={cx(thCls, '!text-left')}>Vendor</th><th className={thCls}>Output / day</th><th className={thCls}>Efficiency %</th><th className={thCls}>Cavities</th><th className={thCls}>Cycle (s)</th><th className={thCls}>Budget qty</th><th className={thCls}>Days of output for the budget</th><th className={thCls}>Open PR</th><th className={thCls}>Asset value</th><th className={thCls}>Depreciation</th></tr></thead>
                <tbody>{util.map((u) => (
                  <tr key={u.mould + u.vendor} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs">{u.mould}</td><td className="px-2.5 py-1.5 text-left text-xs">{u.vendor}</td><td className={tdCls}>{f(u.outputDay, 0)}</td><td className={tdCls}>{f(u.efficiency, 1)}</td><td className={tdCls}>{f(u.cavities, 0)}</td><td className={tdCls}>{f(u.cycle, 2)}</td>
                    <td className={tdCls}>{u.budQty ? f(u.budQty, 0) : '-'}</td><td className={tdCls}>{u.daysForBudget ? f(u.daysForBudget, 1) : '-'}</td><td className={tdCls}>{f(u.openPr, 0)}</td><td className={tdCls}>{f(u.asset, 0)}</td><td className={tdCls}>{f(u.depreciation, 0)}</td></tr>))}</tbody></table>
              <p className="p-2 text-2xs text-muted">Days of output for the budget = budget quantity (ZCOMPONENT, latest year) / output per day: an indication of how much of the year the mould must run for this item.</p>
            </div>
          )}

          {tab === 'history' && (data.history.length === 0 ? <p className="text-sm text-muted">ZRIGID has not saved a rate for this item in plant {plant}.</p> : (
            <div className="overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[720px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Valid</th><th className={cx(thCls, '!text-left')}>Mould</th><th className={cx(thCls, '!text-left')}>Vendor</th><th className={cx(thCls, '!text-left')}>Info record</th><th className={thCls}>Landed / 1000</th><th className={thCls}>Resin</th><th className={thCls}>Conversion</th><th className={cx(thCls, '!text-left')}>Saved by</th></tr></thead>
                <tbody>{data.history.map((h, i) => (
                  <tr key={i} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs">{h.validFrom} to {h.validTo}</td><td className="px-2.5 py-1.5 text-left text-xs">{h.mould}</td><td className="px-2.5 py-1.5 text-left text-xs">{h.lifnr}</td><td className="px-2.5 py-1.5 text-left text-xs">{h.infnr}</td>
                    <td className={cx(tdCls, 'font-bold')}>{f(h.landed, 0)}</td><td className={tdCls}>{f(h.mat)}</td><td className={tdCls}>{f(h.conv)}</td><td className="px-2.5 py-1.5 text-left text-xs">{h.user} {h.created ?? ''}</td></tr>))}</tbody></table>
            </div>
          ))}

          {tab === 'whatif' && wi && sim && (
            <div className="flex flex-col gap-3">
              <p className="text-2xs text-muted">Change a value (changed boxes turn orange) and see the landed rate with the same formulas as ZRIGID. Nothing is posted; the result stays in this window.</p>
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {num('zmrt', 'Machine-day rate ZMRT')}{num('cycTime', 'Cycle time (s)')}{num('cavities', 'Cavities')}{num('hoursDay', 'Hours / day')}{num('efficiency', 'Efficiency %')}{num('zmbx', 'Box ZMBX')}
                {num('zmpb', 'ZMPB')}{num('zmtp', 'ZMTP')}{num('zppbT', 'PP box total')}{num('zmac', 'ZMAC')}{num('zmat', 'ZMAT')}{num('itcPct', 'ITC %')}
                {num('marPct', 'Margin %')}{num('zehp', 'ZEHP')}{num('zwad', 'ZWAD')}{num('zdaj', 'ZDAJ')}{num('zmfg', 'Freight ZMFG')}
              </div>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Polymer / master batch</th><th className={thCls}>Rate (ZPBR)</th><th className={thCls}>Scrap %</th><th className={thCls}>Cost / 1000</th></tr></thead>
                  <tbody>{mould.comps.map((c) => {
                    const q = dd(c.BomQty).times(new Decimal(1).plus(dd(wi.scrap[c.Comp]).div(100)));
                    return (<tr key={c.Comp} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{strip0(c.Comp)}</span> <span className="text-muted">{c.CompTxt}</span></td>
                      <td className="px-1 py-1 text-right"><input className={cx(inputCls, 'w-24 text-right text-xs', wi.rates[c.Comp] !== c.Zpbr && 'border-sim bg-sim/10')} inputMode="decimal" value={wi.rates[c.Comp] ?? ''} onChange={(e) => setW({ rates: { ...wi.rates, [c.Comp]: e.target.value.replace(',', '.') } })} /></td>
                      <td className="px-1 py-1 text-right"><input className={cx(inputCls, 'w-20 text-right text-xs', wi.scrap[c.Comp] !== c.ScrapPct && 'border-sim bg-sim/10')} inputMode="decimal" value={wi.scrap[c.Comp] ?? ''} onChange={(e) => setW({ scrap: { ...wi.scrap, [c.Comp]: e.target.value.replace(',', '.') } })} /></td>
                      <td className={tdCls}>{f(dd(wi.rates[c.Comp]).times(q))}</td></tr>);
                  })}</tbody></table>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {([['What-if landed / 1000', sim.landedRounded, sapLanded], ['What-if landed / pc', sim.perPiece, sapLanded ? sapLanded.div(1000) : null], ['Resin / 1000', sim.mat, dd(mould.row.MatCost)], ['Conversion / 1000', sim.conv, dd(mould.row.ConvCost)]] as [string, Decimal, Decimal | null][]).map(([k, v, b], i) => (
                  <div key={k} className="rounded-xl border border-line p-2.5"><div className="text-2xs font-bold uppercase text-muted">{k}</div><div className="num text-base font-extrabold">{f(v, i === 1 ? 4 : i === 0 ? 0 : 2)}</div>
                    {b && (() => { const d = v.minus(b); const flat = d.abs().lt(i === 1 ? 0.00005 : 0.005); return <div className={cx('text-2xs', flat ? 'text-muted' : d.gt(0) ? 'text-bad' : 'text-good')}>{flat ? 'same as SAP' : `${sgn(d, i === 1 ? 4 : 2)} against SAP`}</div>; })()}</div>))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Against the rate used in this costing ({f(cockpit.ratePc, 4)} / pc): {cockpit.ratePc ? <b className={sim.perPiece.gt(cockpit.ratePc) ? 'text-bad' : 'text-good'}>{sgn(sim.perPiece.minus(cockpit.ratePc), 4)} / pc</b> : 'n/a'}</span>
                <span className="text-muted">· against budget ({f(budPc, 4)} / pc): {budPc ? <b className={sim.perPiece.gt(budPc) ? 'text-bad' : 'text-good'}>{sgn(sim.perPiece.minus(budPc), 4)} / pc</b> : 'n/a'}</span>
                <Button onClick={() => setWi(baseWhatIf(mould))}>Reset to SAP values</Button>
                {onApply && <Button variant="primary" onClick={() => onApply(sim.perPiece.toDecimalPlaces(6).toString())} title="Fills the manual override of this BOM line with the what-if rate per piece (simulation in your browser only)">Apply to BOM simulation ({f(sim.perPiece, 4)} / pc)</Button>}
              </div>
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Resin rate sensitivity (all polymer lines together)</h4>
              <div className="flex flex-wrap gap-2">{sens.map((s) => <div key={s.pct} className="rounded-xl border border-line px-3 py-1.5 text-center text-xs"><div className="font-bold">{s.pct > 0 ? '+' : ''}{s.pct} %</div><div className="num">{f(s.landed, 0)}</div><div className={cx('text-2xs', s.delta.gt(0) ? 'text-bad' : 'text-good')}>{sgn(s.delta, 0)}</div></div>)}</div>
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Which rigid items use the same polymer?</h4>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-2xs font-bold">Polymer<select className={cx(inputCls, 'mt-0.5 block w-72')} value={poly} onChange={(e) => { setPoly(e.target.value); setUsage(null); }}>{mould.comps.map((c) => <option key={c.Comp} value={c.Comp}>{strip0(c.Comp)} {c.CompTxt}</option>)}</select></label>
                <label className="text-2xs font-bold">Rate change %<input className={cx(inputCls, 'mt-0.5 block w-20 text-right')} inputMode="decimal" value={polyPct} onChange={(e) => { setPolyPct(e.target.value.replace(',', '.')); setUsage(null); }} /></label>
                <Button onClick={() => void findUsage()} disabled={usageBusy}>{usageBusy ? 'Reading…' : 'Show the impact'}</Button>
              </div>
              {usage && (usage.length === 0 ? <p className="text-xs text-muted">No other rigid item uses this polymer in plant {plant}.</p> : (
                <div className="overflow-auto rounded-xl border border-line"><table className="w-full min-w-[560px] border-collapse"><thead><tr><th className={cx(thCls, '!text-left')}>Rigid item</th><th className={thCls}>Plant</th><th className={thCls}>BOM qty</th><th className={thCls}>Change per 1000 pcs</th><th className={thCls}>Per piece</th></tr></thead>
                  <tbody>{usage.map((u) => <tr key={u.matnr + u.werks} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{u.matnr}</span> <span className="text-muted">{u.maktx}</span></td><td className={tdCls}>{u.werks}</td><td className={tdCls}>{f(u.qty, 4)}</td><td className={cx(tdCls, u.deltaPer1000.gt(0) ? 'text-bad' : 'text-good')}>{sgn(u.deltaPer1000)}</td><td className={tdCls}>{sgn(u.deltaPer1000.div(1000), 4)}</td></tr>)}</tbody></table></div>
              ))}
            </div>
          )}

          {tab === 'alerts' && (alerts.length === 0 ? <p className="text-sm text-muted">No alert for this item.</p> : (
            <ul className="flex flex-col gap-1.5">{alerts.map((a, i) => <li key={i} className="flex items-start gap-2 rounded-xl border border-line p-2.5 text-xs"><span className={cx('mt-0.5 rounded-full px-2 py-0.5 text-2xs font-extrabold uppercase', SEV[a.sev])}>{a.sev}</span><span>{a.text}</span></li>)}</ul>
          ))}
        </div>
      )}
    </Drawer>
  );
}
