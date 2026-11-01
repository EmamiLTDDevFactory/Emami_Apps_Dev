'use client';
/** The parts of the Standard cost (CK13N) page: header card, Cost components, Itemization, Estimates and compare. SAP computed every figure shown. */
import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle2, ClipboardCopy, ExternalLink, Info } from 'lucide-react';
import { Button, Pill, Spinner, cx, inputCls } from '../ui';
import OriginBreakup from '../costline/OriginBreakup';
import { itemOrigin, originBreakup } from '@/lib/cost/originBreakup';
import { useChartTheme } from '../charts';
import { fmtDate, fmtNum, fmtQty, fmtSigned } from '@/lib/format';
import type { WacEntry } from '@/lib/wac/cache';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from '@/lib/ck/types';
import { compareEstimates, dec, filterItems, isOlderEstimateMsg, groupColor, groupName, itemTypes, keyFromRow, partComps, sameKey, sortComps, statusTone, stdCheck, type StatusTone } from '@/lib/ck/view';
import type { CkEstimateKey } from '@/lib/ck/filter';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const NA = <span className="text-faint" title="No value from SAP">n/a</span>;
/** An amount with its currency next to it; n/a (grey) when SAP sent nothing, never 0. */
export const money = (v: string, curr: string, dp = 4) => (dec(v) === null ? NA : <>{fmtNum(v, dp, curr)} <span className="text-muted">{curr}</span></>);
const tonePill: Record<StatusTone, 'good' | 'accent' | 'neutral'> = { good: 'good', info: 'accent', neutral: 'neutral' };
export function StatusChip({ text }: { text: string }) { return <Pill tone={tonePill[statusTone(text)]}>{text || 'n/a'}</Pill>; }

/* ------------------------------ header card ------------------------------ */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col"><dt className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</dt><dd className="min-w-0 break-words text-sm">{children}</dd></div>;
}
const val = (s: string | null | undefined) => (s && String(s).trim() ? s : NA);
const day = (iso: string | null) => (iso ? fmtDate(iso) : NA);

export function HeaderCard({ h, onCopy, copied }: { h: CkHeaderRow; onCopy: () => void; copied: boolean }) {
  const chk = stdCheck(h);
  return (
    <section className="rounded-2xl border border-line bg-panel p-4 shadow-card" aria-label="Cost estimate header">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold"><span className="font-mono text-accent">{h.Matnr}</span> {h.Maktx}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusChip text={h.StatusTxt || h.Status} />
            {h.CurStd && <Pill tone="accent" title="The latest released estimate touching the last 30 days">Standard (last 30 days)</Pill>}
            <span className="text-xs text-muted">{h.NComp} components · {h.NItem} items</span>
          </div>
          {isOlderEstimateMsg(h.Msg) && <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted"><Info size={13} className="mt-0.5 shrink-0" aria-hidden /> <span>{h.Msg}</span></p>}
        </div>
        <Button size="sm" onClick={onCopy} title="Copies the key values to type into CK13N"><ClipboardCopy size={13} /> {copied ? 'Copied' : 'Copy for SAP'}</Button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 md:grid-cols-4">
        <Row label="Material">{h.Matnr} {h.Maktx}</Row>
        <Row label="Plant">{h.Werks} {h.WerksTxt}</Row>
        <Row label="Costing Variant">{val(h.Klvar)}</Row>
        <Row label="Costing Version">{val(h.Tvers)}</Row>
        <Row label="Costing Date From">{day(h.Kadat)}</Row>
        <Row label="Costing Date To">{day(h.Bidat)}</Row>
        <Row label="Qty Structure Date">{day(h.Aldat)}</Row>
        <Row label="Valuation Date">{day(h.Bwdat)}</Row>
        <Row label="Costing Lot Size">{dec(h.Losgr) ? <>{fmtQty(h.Losgr)} {h.Meeht}</> : NA}</Row>
        <Row label="Status">{h.StatusTxt || h.Status || NA}</Row>
        <Row label="Created by">{val(h.Ernam)}</Row>
        <Row label="Created on">{day(h.Erdat)}</Row>
      </dl>
      <div className="mt-3 grid gap-3 rounded-xl border border-line bg-sunken/50 p-3 md:grid-cols-4">
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Total per unit (this estimate)</div>
          <div className="num text-xl font-extrabold" title={h.ValueBasis ? `Value basis: ${h.ValueBasis}` : undefined}>{money(h.TotalUnit, h.Curr)}</div>
          <div className="text-2xs text-muted">per lot {money(h.TotalLot, h.Curr, 2)}{h.ValueBasis && <span title={h.ValueBasis} className="ml-1 inline-flex align-middle text-faint"><Info size={12} aria-label={`Value basis: ${h.ValueBasis}`} /></span>}</div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Standard price</div>
          <div className="num text-xl font-extrabold">{money(h.StdPrice, h.Curr)}</div>
          <div className="text-2xs text-muted">price control {h.PriceCtrl || 'n/a'} · price unit {dec(h.Peinh) ? fmtQty(h.Peinh) : 'n/a'}</div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Moving average price</div>
          <div className="num text-xl font-extrabold">{money(h.MapPrice, h.Curr)}</div>
          <div className="text-2xs text-muted">fixed unit {val(h.FixedUnit)} · variable unit {val(h.VarUnit)}</div>
        </div>
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">Difference to standard price</div>
          <div className="num text-xl font-extrabold">{dec(h.StdDiff) ? <>{fmtSigned(dec(h.StdDiff)!, 4, h.Curr)} <span className="text-sm text-muted">{h.Curr}</span></> : NA}</div>
          <div className="text-2xs text-muted">{chk.pct ? `${chk.pct.gt(0) ? '+' : chk.pct.lt(0) ? '−' : ''}${chk.pct.abs().toFixed(2)} %` : 'n/a'}</div>
        </div>
        <div className="flex items-center md:col-span-4">
          {chk.state === 'ok' && <p className="flex items-start gap-1.5 text-sm text-good"><CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> <span><b>Matches the standard price</b> (difference below 0.5 %).</span></p>}
          {chk.state === 'note' && <p className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2 py-1.5 text-sm text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> <span><b>Differs from the standard price by {chk.pct!.abs().toFixed(2)} %.</b> {chk.msg}</span></p>}
          {chk.state === 'plain' && chk.msg && <p className="text-sm text-muted">{chk.msg}</p>}
          {chk.state === 'na' && <p className="text-sm text-faint">No comparison with the standard price from SAP.{chk.msg ? ` ${chk.msg}` : ''}</p>}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ cost components ------------------------------ */
export function ComponentsTab({ comps }: { comps: CkCompRow[] }) {
  const t = useChartTheme();
  const rows = useMemo(() => sortComps(comps), [comps]);
  const parts = useMemo(() => partComps(comps), [comps]);
  const groups = useMemo(() => Array.from(new Set(parts.map((p) => String(p.Grp)))), [parts]);
  const num = (v: string) => { const d = dec(v); return d && d.gt(0) ? Number(d.toFixed(6)) : 0; };
  if (!rows.length) return <p className="text-sm text-muted">SAP returned no cost components for this estimate.</p>;
  const bar = [{ name: 'Per unit', ...Object.fromEntries(parts.map((p, i) => [`c${i}`, num(p.Total)])) }];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken"><tr><th className={th}>Cost component</th><th className={th}>Group</th><th className={thN}>Total per unit</th><th className={thN}>Share</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.CompNo}-${i}`} className={cx('border-t border-line/60', r.IsSum && 'bg-sunken/60 font-extrabold', r.IsMemo && 'text-faint')}>
                <td className={td}>{r.CompNo && <span className="font-mono text-xs text-muted">{r.CompNo} </span>}{r.CompTxt}{r.IsMemo && <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted" title="Memo component: shown for information, not part of the cost share">Memo</span>}</td>
                <td className={td}>{r.IsSum ? <span>Total</span> : <span className="inline-flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: groupColor(String(r.Grp)) }} />{groupName(String(r.Grp))}</span>}</td>
                <td className={tdN}>{money(r.Total, r.Curr)}</td>
                <td className={tdN}>{r.IsMemo ? <span className="text-faint" title="Memo component: left out of the share">n/a</span> : dec(r.SharePct) ? `${fmtNum(r.SharePct, 1, 'X')} %` : NA}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-xl border border-line p-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Cost per unit, by component (coloured by group)</h3>
          <div className="h-20" role="img" aria-label="Stacked bar of the cost components per unit, coloured by group">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bar} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="name" hide />
                <Tooltip formatter={(v, name) => [fmtNum(Number(v ?? 0), 4, 'INR'), String(name)]} />
                {parts.map((p, i) => <Bar key={i} dataKey={`c${i}`} name={`${p.CompNo} ${p.CompTxt}`.trim()} stackId="s" fill={groupColor(String(p.Grp))} stroke="#fff" isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted">{groups.map((g) => <li key={g} className="inline-flex items-center gap-1"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: groupColor(g) }} />{groupName(g)}</li>)}</ul>
        </div>
        <div className="rounded-xl border border-line p-3">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Share by component</h3>
          <div className="h-56" role="img" aria-label="Donut chart of the cost components per unit">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={parts.map((p) => ({ name: `${p.CompNo} ${p.CompTxt}`.trim(), value: num(p.Total), grp: String(p.Grp) })).filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={1} stroke={t.surface} isAnimationActive={false}>
                  {parts.filter((p) => num(p.Total) > 0).map((p, i) => <Cell key={i} fill={groupColor(String(p.Grp))} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtNum(Number(v ?? 0), 4, 'INR')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ itemization ------------------------------ */
export function ItemsTab({ items, onOpen, originMap, originState, onLoadOrigins }: { items: CkItemRow[]; onOpen: (matnr: string) => void; originMap?: ReadonlyMap<string, string> | null; originState?: { status: 'idle' | 'loading' | 'done' | 'error'; note?: string }; onLoadOrigins?: () => void }) {
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const kinds = useMemo(() => itemTypes(items), [items]);
  const [ogrp, setOgrp] = useState('');
  const shown = useMemo(() => filterItems(items, types, q).filter((r) => !ogrp || (itemOrigin(r, originMap) || '(none)') === ogrp), [items, types, q, ogrp, originMap]);
  const origin = useMemo(() => originBreakup(shown.map((r) => ({ origin: itemOrigin(r, originMap), value: r.ValueUnit }))), [shown, originMap]);
  const knownOrigin = useMemo(() => items.some((r) => itemOrigin(r, originMap)), [items, originMap]);
  const curr = items.find((r) => r.Curr)?.Curr || 'INR';
  const toggle = (c: string) => setTypes((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  if (!items.length) return <p className="text-sm text-muted">SAP returned no items for this estimate.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {kinds.map((k) => (
          <button key={k.code} type="button" aria-pressed={types.has(k.code)} onClick={() => toggle(k.code)} className={cx('rounded-full border px-3 py-1 text-xs font-bold', types.has(k.code) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{k.text} <span className="font-normal">({k.n})</span></button>
        ))}
        <input aria-label="Search items" className={cx(inputCls, 'w-56')} placeholder="Search item, material, cost element…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Origin group" className={cx(inputCls, 'w-48')} value={ogrp} onChange={(e) => setOgrp(e.target.value)}>
          <option value="">All origin groups</option>
          {origin.slices.map((s) => <option key={s.origin} value={s.origin === '(no origin group)' ? '(none)' : s.origin}>{s.origin}</option>)}
        </select>
        <span className="text-xs text-faint">{shown.length} of {items.length} items</span>
      </div>
      {!knownOrigin && onLoadOrigins && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-2 text-xs text-muted">
          SAP did not send an origin group on these items. {originState?.status === 'loading' ? <><Spinner className="h-3 w-3" /> Reading it from the BOM costing…</> : <Button size="sm" onClick={onLoadOrigins}>Get origin groups from BOM costing</Button>}
          {originState?.status === 'error' && <span className="text-bad">{originState.note}</span>}
        </p>
      )}
      <OriginBreakup slices={origin.slices} total={origin.total} curr={curr} unit="value per unit of the items shown" note={originState?.status === 'done' ? 'Origin group of each component from the BOM costing (CompOgrp).' : undefined} />
      <div className="max-h-[560px] overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-sunken"><tr>
            <th className={th}>Item</th><th className={th}>Type</th><th className={th}>Cost element</th><th className={th}>Origin group</th><th className={th}>Material / activity</th><th className={th}>Description</th>
            <th className={thN}>Quantity</th><th className={thN}>Price</th><th className={thN}>Value per lot</th><th className={thN}>Value per unit</th><th className={th}><span className="sr-only">Estimate</span></th>
          </tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.Posnr}-${i}`} className="border-t border-line/60">
                <td className={cx(td, 'font-mono text-xs')}>{r.Posnr}</td>
                <td className={td}>{r.TyppsTxt || r.Typps}</td>
                <td className={td}><span className="font-mono text-xs text-muted">{r.Kstar}</span> {r.KstarTxt}</td>
                <td className={td}>{itemOrigin(r, originMap) || <span className="text-faint">–</span>}</td>
                <td className={td}><span className="font-mono text-xs">{r.Idnrk || r.Lstar || ''}</span>{r.Kostl && <span className="text-2xs text-muted"> · CC {r.Kostl}</span>}{r.ItemWerks && <span className="text-2xs text-muted"> · {r.ItemWerks}</span>}</td>
                <td className={td}>{r.ItemTxt}</td>
                <td className={tdN}>{dec(r.Qty) ? <>{fmtQty(r.Qty)} <span className="text-muted">{r.QtyUnit || r.Uom}</span></> : NA}</td>
                <td className={tdN}>{money(r.Price, r.Curr)}{dec(r.PriceUnit) && <span className="text-2xs text-muted"> / {fmtNum(r.PriceUnit, 0, 'X')}</span>}</td>
                <td className={tdN}>{money(r.ValueLot, r.Curr, 2)}</td>
                <td className={tdN}>{money(r.ValueUnit, r.Curr)}</td>
                <td className={td}>{r.HasEst && r.Idnrk && <Button size="sm" variant="ghost" onClick={() => onOpen(r.Idnrk)} aria-label={`Open estimate of ${r.Idnrk}`}><ExternalLink size={12} /> Open estimate</Button>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={11} className="px-3 py-5 text-center text-muted">Nothing matches the filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ estimates + compare ------------------------------ */
export interface CompareData { a: WacEntry<CkCompRow> | undefined; b: WacEntry<CkCompRow> | undefined; labelA: string; labelB: string }
const label = (r: CkListRow) => `${r.Tvers || '-'} / ${r.Klvar || '-'} / ${r.Kadky ?? '-'}${r.CurStd ? ' (current)' : ''}`;
export { label as estimateLabel };

export function EstimatesTab({ rows, active, onOpen, onCompare, compare }: { rows: CkListRow[]; active: CkEstimateKey | null; onOpen: (r: CkListRow) => void; onCompare: (a: CkListRow, b: CkListRow) => void; compare: CompareData | null }) {
  const [pick, setPick] = useState<number[]>([]);
  const toggle = (i: number) => setPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length >= 2 ? [p[1], i] : [...p, i]));
  if (!rows.length) return <p className="text-sm text-muted">SAP has no cost estimate for this material and plant.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken"><tr>
            <th className={th}><span className="sr-only">Compare</span></th><th className={th}>Status</th><th className={th}>Variant</th><th className={th}>Version</th><th className={th}>Costing date</th><th className={th}>Valid</th>
            <th className={thN}>Lot size</th><th className={thN}>Total per unit</th><th className={th}>Created</th><th className={th}><span className="sr-only">Open</span></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const k = keyFromRow(r);
              const isOpen = sameKey(k, active);
              return (
                <tr key={`${r.Kalnr}-${r.Kadky}-${r.Tvers}-${r.Bwvar}-${i}`} className={cx('border-t border-line/60', isOpen && 'bg-accent/5')}>
                  <td className={td}><input type="checkbox" aria-label={`Select estimate ${label(r)} for compare`} checked={pick.includes(i)} onChange={() => toggle(i)} /></td>
                  <td className={td}><StatusChip text={r.StatusTxt || r.Status} /> {r.CurStd && <Pill tone="accent">Standard (last 30 days)</Pill>}</td>
                  <td className={td}>{val(r.Klvar)}</td><td className={td}>{val(r.Tvers)}</td><td className={td}>{day(r.Kadky)}</td>
                  <td className={td}>{day(r.Kadat)} – {day(r.Bidat)}</td>
                  <td className={tdN}>{dec(r.Losgr) ? <>{fmtQty(r.Losgr)} {r.Meeht}</> : NA}</td>
                  <td className={cx(tdN, 'font-bold')}>{money(r.Total, r.Curr)}</td>
                  <td className={td}>{r.Ernam} <span className="text-2xs text-muted">{r.Erdat ? fmtDate(r.Erdat) : ''}</span></td>
                  <td className={td}>{k && <Button size="sm" variant={isOpen ? 'secondary' : 'ghost'} onClick={() => onOpen(r)} aria-pressed={isOpen}>{isOpen ? 'Open' : 'Show this estimate'}</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={pick.length !== 2} onClick={() => onCompare(rows[pick[0]], rows[pick[1]])}>Compare the 2 selected</Button>
        <span className="text-xs text-faint">Tick two estimates: A is the first ticked, B the second.</span>
      </div>
      {compare && <CompareTable data={compare} />}
    </div>
  );
}

function CompareTable({ data }: { data: CompareData }) {
  const { a, b } = data;
  if (!a || !b || a.status === 'loading' || b.status === 'loading') return <p className="text-sm text-muted">Loading the components of both estimates from SAP…</p>;
  const failed = [a, b].find((e) => e.status === 'error');
  if (failed) return <p role="alert" className="text-sm text-bad">{failed.error}</p>;
  if (a.status !== 'done' || b.status !== 'done') return <p className="text-sm text-muted">Cancelled.</p>;
  const rows = compareEstimates(a.data ?? [], b.data ?? []);
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead className="bg-sunken"><tr>
          <th className={th}>Cost component</th><th className={th}>Group</th><th className={thN}>A: {data.labelA}</th><th className={thN}>B: {data.labelB}</th>
          <th className={thN}>Difference B − A <span className="font-normal normal-case text-faint">(difference, computed here)</span></th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const d = dec(r.diff);
            return (
              <tr key={`${r.CompNo}-${i}`} className={cx('border-t border-line/60', r.IsSum && 'bg-sunken/60 font-extrabold')}>
                <td className={td}>{r.CompNo && <span className="font-mono text-xs text-muted">{r.CompNo} </span>}{r.CompTxt}</td>
                <td className={td}>{r.IsSum ? 'Total' : groupName(r.Grp)}</td>
                <td className={tdN}>{r.a === null ? NA : money(r.a, r.curA)}</td>
                <td className={tdN}>{r.b === null ? NA : money(r.b, r.curB)}</td>
                <td className={cx(tdN, 'font-semibold', d?.gt(0) && 'text-bad', d?.lt(0) && 'text-good')} title={r.curA !== r.curB && r.a !== null && r.b !== null ? 'Currencies differ: no difference is shown (never converted)' : undefined}>
                  {d ? <>{fmtSigned(d, 4, r.curA)} <span className="text-muted">{r.curA}</span><span className="sr-only">{d.gt(0) ? ' (B higher)' : d.lt(0) ? ' (B lower)' : ' (equal)'}</span></> : NA}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
