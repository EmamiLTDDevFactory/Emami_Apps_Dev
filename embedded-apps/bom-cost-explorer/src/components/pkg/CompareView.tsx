'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, Spinner, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchItems } from '@/lib/pkg/api';
import { exportCompare } from '@/lib/pkg/export';
import { compareRows, fmtRate4, fmtVar2, groupItems, scenLabel, stripZeros } from '@/lib/pkg/rules';
import type { PkgGroup, PkgScen } from '@/lib/pkg/types';

const BASE = 'baseline';
const tone = (d: number | null) => (d === null || d === 0 ? '' : d > 0 ? 'text-bad' : 'text-good');
const th = 'whitespace-nowrap border-b border-line px-2 py-1.5 text-xs font-bold';
const td = 'whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-right';

export default function CompareView({ scen, scens, groups }: { scen: PkgScen; scens: PkgScen[]; groups: PkgGroup[] }) {
  const [other, setOther] = useState(BASE);
  const [otherGroups, setOtherGroups] = useState<PkgGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (other === BASE) { setOtherGroups(null); setError(''); return; }
    const ac = new AbortController();
    setLoading(true); setError('');
    fetchItems(other, { signal: ac.signal }).then((r) => setOtherGroups(groupItems(r))).catch((e) => { if (!ac.signal.aborted) { setOtherGroups(null); setError(errorText(e)); } }).finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [other]);

  const rows = useMemo(() => compareRows(groups, other === BASE ? null : otherGroups ?? []), [groups, other, otherGroups]);
  const label = other === BASE ? 'SAP baseline' : `#${stripZeros(other)}`;
  const top = useMemo(() => rows.filter((r) => r.delta !== null).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0)).slice(0, 10).map((r) => ({ name: stripZeros(r.Matnr), delta: r.delta as number })), [rows]);

  return (
    <div className="flex flex-col gap-3">
      <Card title="Compare with" actions={<Button size="sm" onClick={() => void exportCompare(scen, label, rows)} disabled={!rows.length}><Download size={14} /> Excel</Button>}>
        <div className="flex items-center gap-2">
          <select aria-label="Compare with" className={`${inputCls} max-w-xl`} value={other} onChange={(e) => setOther(e.target.value)}>
            <option value={BASE}>Baseline (pure SAP data)</option>
            {scens.filter((s) => s.ScenId !== scen.ScenId).map((s) => <option key={s.ScenId} value={s.ScenId}>{scenLabel(s)}</option>)}
          </select>
          {loading && <Spinner />}
        </div>
      </Card>
      {error && <ErrorBox>{error}</ErrorBox>}
      {top.length > 0 && (
        <Card title="Top 10 absolute deltas (budgeted)">
          <div className="h-56 w-full" role="img" aria-label="Bar chart of the ten largest budgeted rate differences">
            <ResponsiveContainer>
              <BarChart data={top} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v) => fmtRate4(Number(v))} />
                <Bar dataKey="delta" name="Delta budgeted">{top.map((t) => <Cell key={t.name} fill={t.delta > 0 ? 'var(--bad, #c0392b)' : 'var(--good, #1e8e5a)'} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <div className="max-h-[60vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className="sticky top-0 bg-panel">
            <tr>
              <th className={`${th} text-left`}>Material</th><th className={`${th} text-left`}>Description</th>
              <th className={`${th} text-right`}>Basic (this)</th><th className={`${th} text-right`}>Budgeted (this)</th><th className={`${th} text-right`}>Var % (this)</th>
              <th className={`${th} text-right`}>Basic ({label})</th><th className={`${th} text-right`}>Budgeted ({label})</th><th className={`${th} text-right`}>Var % ({label})</th><th className={`${th} text-right`}>Delta budgeted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.Matnr} className="border-b border-line/60">
                <td className="px-2 py-1.5 text-xs font-bold">{stripZeros(r.Matnr)}</td>
                <td className="max-w-[240px] truncate px-2 py-1.5 text-xs" title={r.Maktx}>{r.Maktx}</td>
                <td className={td}>{fmtRate4(r.basicThis)}</td><td className={td}>{fmtRate4(r.budThis)}</td><td className={td}>{fmtVar2(r.varThis)}</td>
                <td className={td}>{r.basicOther === null ? '—' : fmtRate4(r.basicOther)}</td><td className={td}>{r.budOther === null ? '—' : fmtRate4(r.budOther)}</td><td className={td}>{r.varOther === null ? '—' : fmtVar2(r.varOther)}</td>
                <td className={`${td} font-bold ${tone(r.delta)}`}>{r.delta === null ? '—' : `${r.delta > 0 ? '▲ ' : r.delta < 0 ? '▼ ' : ''}${fmtRate4(r.delta)}`}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted">No materials</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
