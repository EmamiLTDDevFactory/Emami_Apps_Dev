'use client';
/**
 * Media and activity mix: ATL media split (TV, digital, print, ...) with digital share of ATL, BTL activity split
 * (free issue & sampling, visibility, consumer & trade promotion, ...), mix shift vs PY in percentage points, top G/L accounts.
 * Media buckets come from the backend (G/L number for ATL, G/L name keywords for the rest).
 */
import { useMemo } from 'react';
import { MonitorPlay, Smartphone, Store, Ticket } from 'lucide-react';
import { useApp } from '@/lib/context';
import { growth, pct, pctPlain, share, short } from '@/lib/format';
import { actuals, rollup, type Roll } from '@/lib/model';
import { BarList, OTHER, SERIES, SplitBar } from '../charts';
import { Card, Kpi } from '../ui';

const ATL_MEDIA = ['TV', 'Digital', 'Print', 'Radio', 'Cinema', 'Sponsorship', 'Other ATL'];
const BTL_ACT = ['Free issue & sampling', 'Visibility & in-store', 'Consumer & trade promotion', 'E-commerce', 'Research', 'Production & creative', 'Other BTL'];
// Colour follows the bucket (fixed order), never its rank; the 7th bucket of each list is "Other" (grey).
const colorOf = (list: string[], key: string) => { const i = list.indexOf(key); return i < 0 || i === list.length - 1 ? OTHER : SERIES[i]; };

function order(rolls: Roll[], list: string[]) {
  const known = list.map((k) => rolls.find((r) => r.key === k)).filter((r): r is Roll => !!r);
  const rest = rolls.filter((r) => !list.includes(r.key));
  if (!rest.length) return known;
  const other = known.find((r) => r.key === list[list.length - 1]);
  const merged = rest.reduce((a, r) => ({ ...a, cy: a.cy + r.cy, py: a.py + r.py }), other ?? { ...rest[0], key: list[list.length - 1], label: list[list.length - 1], cy: 0, py: 0 });
  return [...known.filter((r) => r !== other), merged];
}

function ShiftTable({ rolls, list, fmt }: { rolls: Roll[]; list: string[]; fmt: (v: number) => string }) {
  const cy = rolls.reduce((s, r) => s + r.cy, 0); const py = rolls.reduce((s, r) => s + r.py, 0);
  return (
    <div className="scroll-thin mt-4 overflow-x-auto"><table className="w-full min-w-[26rem] text-[12px]">
      <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-muted"><th className="py-1.5 text-left">Bucket</th><th className="text-right">CY YTD</th><th className="text-right">Share</th><th className="text-right">PY share</th><th className="text-right">Shift</th><th className="text-right">YoY</th></tr></thead>
      <tbody className="divide-y divide-line">
        {rolls.map((r) => {
          const s = share(r.cy, cy); const sp = share(r.py, py);
          return (
            <tr key={r.key}>
              <td className="py-1.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: colorOf(list, r.key) }} />{r.key}</td>
              <td className="num text-right font-semibold">{fmt(r.cy)}</td>
              <td className="num text-right">{pctPlain(s)}</td>
              <td className="num text-right text-muted">{pctPlain(sp)}</td>
              <td className="num text-right">{s - sp >= 0 ? '+' : ''}{(s - sp).toFixed(1)} pp</td>
              <td className="num text-right">{pct(growth(r.cy, r.py))}</td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}

export default function MediaMix() {
  const { rows, fmt, go } = useApp();
  const atl = useMemo(() => order(rollup(actuals(rows).filter((r) => r.SpendClass === 'ATL'), (r) => r.Medium), ATL_MEDIA), [rows]);
  const btl = useMemo(() => order(rollup(actuals(rows).filter((r) => r.SpendClass === 'BTL'), (r) => r.Medium), BTL_ACT), [rows]);
  const gls = useMemo(() => rollup(actuals(rows), (r) => r.GLAccount, (r) => `${r.GLAccount.replace(/^0+/, '')} ${r.GLAccountName}`), [rows]);

  const sum = (rs: Roll[], f: 'cy' | 'py') => rs.reduce((s, r) => s + r[f], 0);
  const get = (rs: Roll[], k: string) => rs.find((r) => r.key === k) ?? { cy: 0, py: 0 };
  const shareOf = (rs: Roll[], k: string, f: 'cy' | 'py') => share(get(rs, k)[f], sum(rs, f));
  const kp = (rs: Roll[], k: string) => ({ s: shareOf(rs, k, 'cy'), d: shareOf(rs, k, 'cy') - shareOf(rs, k, 'py'), amt: get(rs, k).cy });
  const tv = kp(atl, 'TV'); const dig = kp(atl, 'Digital'); const promo = kp(btl, 'Consumer & trade promotion'); const fi = kp(btl, 'Free issue & sampling');
  const pp = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} pp vs PY`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={MonitorPlay} label="TV share of ATL" value={pctPlain(tv.s)} sub={`${short(tv.amt)} · ${pp(tv.d)}`} />
        <Kpi icon={Smartphone} label="Digital share of ATL" value={pctPlain(dig.s)} sub={`${short(dig.amt)} · ${pp(dig.d)}`} />
        <Kpi icon={Ticket} label="Consumer & trade promotion share of BTL" value={pctPlain(promo.s)} sub={`${short(promo.amt)} · ${pp(promo.d)}`} />
        <Kpi icon={Store} label="Free issue & sampling share of BTL" value={pctPlain(fi.s)} sub={`${short(fi.amt)} · ${pp(fi.d)}`} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="ATL media mix" sub={`CY YTD ${fmt(sum(atl, 'cy'))} · ATL, Modelling, Film Prod, Creative heads`}>
          <SplitBar fmt={fmt} parts={atl.map((r) => ({ label: r.key, value: r.cy, color: colorOf(ATL_MEDIA, r.key) }))} />
          <ShiftTable rolls={atl} list={ATL_MEDIA} fmt={fmt} />
        </Card>
        <Card title="BTL activity mix" sub={`CY YTD ${fmt(sum(btl, 'cy'))} · BTL and BTL Sales heads`}>
          <SplitBar fmt={fmt} parts={btl.map((r) => ({ label: r.key, value: r.cy, color: colorOf(BTL_ACT, r.key) }))} />
          <ShiftTable rolls={btl} list={BTL_ACT} fmt={fmt} />
        </Card>
      </div>
      <Card title="Top 15 G/L accounts" sub="CY YTD · tick = PY YTD · click to open the report with that header">
        <BarList max={15} rows={gls.map((g) => ({ key: g.key, label: g.label, value: g.cy, compare: g.py, detail: `${pct(growth(g.cy, g.py))} YoY` }))} fmt={fmt} compareLabel="PY"
          onPick={(key) => { const r = rows.find((x) => x.GLAccount === key); if (r) go('report', { groups: [r.HeaderGroup] }); }} />
      </Card>
    </div>
  );
}
