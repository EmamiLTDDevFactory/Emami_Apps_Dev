'use client';

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ExplainFactor } from '../types';
import { BrainCircuit } from 'lucide-react';

interface Props {
  factors: ExplainFactor[];
  opening: number;
}

/** Waterfall explaining how the opening position bridges to the week-13 closing cash. */
export default function ExplainPanel({ factors, opening }: Props) {
  // Build a running waterfall: opening -> signed factor contributions -> projected close.
  let cumulative = opening;
  const rows = factors.map((f) => {
    if (f.direction === 'positive') {
      const row = { name: f.name, base: +cumulative.toFixed(1), delta: +f.impact.toFixed(1) };
      cumulative += f.impact;
      return row;
    }
    cumulative += f.impact;
    return { name: f.name, base: +cumulative.toFixed(1), delta: +(-f.impact).toFixed(1) };
  });
  const projected = +cumulative.toFixed(1);

  return (
    <section className="card" id="explain">
      <div className="card-head">
        <h2>
          <BrainCircuit size={18} /> AI Explainability
        </h2>
        <span className="chip">Projected W13 close ₹{projected} Cr</span>
      </div>
      <div className="explain-grid">
        <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 44)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} stackOffset="sign">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={168} tick={{ fontSize: 11.5, fill: '#3d5266' }} />
            <Tooltip
              formatter={(value) => [`${value} ₹ Cr`, 'Contribution']}
              contentStyle={{ borderRadius: 12, border: '1px solid #dce6ef', fontSize: 12 }}
            />
            <Bar dataKey="base" stackId="w" fill="transparent" />
            <Bar dataKey="delta" stackId="w" radius={[4, 4, 4, 4]} barSize={18}>
              {rows.map((r, i) => (
                <Cell key={i} fill={factors[i].direction === 'positive' ? '#19a974' : '#ef5b5b'} />
              ))}
              <LabelList dataKey="delta" position="right" formatter={(v: number | string) => `${Number(v) > 0 ? '+' : ''}${v}`} style={{ fontSize: 10.5, fill: '#66788a' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ul className="explain-list">
          {factors
            .filter((f) => f.direction === 'negative')
            .slice(0, 3)
            .map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong>
                <span className="src">{f.source}</span>
                <p>{f.rationale}</p>
              </li>
            ))}
          <li className="hint">Every driver is traced to its SAP source object and ranked by contribution — no black-box outputs.</li>
        </ul>
      </div>
    </section>
  );
}
