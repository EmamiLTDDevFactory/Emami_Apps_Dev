'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartOptions, CurrencyCode, ForecastPoint } from '../types';
import { CURRENCIES } from '../utils/format';

interface Props {
  data: ForecastPoint[];
  policyBuffer: number;
  options?: ChartOptions;
  currency?: CurrencyCode;
}

/** Cash forecast chart: inflow/outflow bars, optional PO-commitment and
 *  sales-pipeline bars, closing-cash line, P10–P90 confidence band,
 *  confidence % line and the liquidity policy buffer. */
export default function ForecastChart({ data, policyBuffer, options, currency = 'INR' }: Props) {
  const series = data.map((p) => ({ ...p, bandGap: +(p.upperBound - p.lowerBound).toFixed(2) }));
  const min = Math.min(policyBuffer, ...data.map((p) => p.lowerBound));
  const showBand = options?.showBand ?? true;
  const showPolicy = options?.showPolicy ?? true;
  const showPo = options?.showPo ?? false;
  const showPipeline = options?.showPipeline ?? false;
  const showConfidence = options?.showConfidence ?? false;
  const sym = CURRENCIES[currency].symbol;

  return (
    <div className="chart" role="img" aria-label="Cash flow forecast chart">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={series} margin={{ top: 10, right: 18, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19a974" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#19a974" stopOpacity={0.65} />
            </linearGradient>
            <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef5b5b" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#ef5b5b" stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3ecf4" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#66788a' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 12, fill: '#66788a' }} domain={[Math.floor(min - 10), 'auto']} />
          <Tooltip
            formatter={(value, name) => [
              name === 'Confidence %' ? `${value}%` : `${value} ${sym} Cr`,
              name,
            ]}
            labelFormatter={(label, payload) => {
              const d = (payload?.[0]?.payload as { date?: string } | undefined)?.date;
              return d ? `${label} · ${d}` : label;
            }}
            contentStyle={{ borderRadius: 12, border: '1px solid #dce6ef', fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {showBand && (
            <>
              <Area dataKey="lowerBound" stackId="band" stroke="none" fill="transparent" name="Confidence band (lower)" legendType="none" />
              <Area dataKey="bandGap" stackId="band" stroke="none" fill="#2878ff16" name="Confidence band" />
            </>
          )}
          <Bar dataKey="inflows" name={`Inflows (${sym} Cr)`} fill="url(#inGrad)" radius={[4, 4, 0, 0]} barSize={14} />
          <Bar dataKey="outflows" name={`Outflows (${sym} Cr)`} fill="url(#outGrad)" radius={[4, 4, 0, 0]} barSize={14} />
          {showPo && <Bar dataKey="poCommitments" name={`PO commitments (${sym} Cr)`} fill="#f3792f" radius={[4, 4, 0, 0]} barSize={10} />}
          {showPipeline && <Bar dataKey="salesPipeline" name={`Sales pipeline (${sym} Cr)`} fill="#2aa8b8" radius={[4, 4, 0, 0]} barSize={10} />}
          {showPolicy && (
            <ReferenceLine
              y={policyBuffer}
              stroke="#f3a712"
              strokeDasharray="6 4"
              label={{ value: `Policy buffer ${sym}${policyBuffer} Cr`, position: 'insideTopRight', fontSize: 11, fill: '#b97e08' }}
            />
          )}
          <Line type="monotone" dataKey="closingCash" name={`Closing cash (${sym} Cr)`} stroke="#2878ff" strokeWidth={3} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="lowerBound" name="P10 bound" stroke="#9db8d4" strokeDasharray="4 4" strokeWidth={1.5} dot={false} legendType="none" />
          {showConfidence && (
            <>
              <YAxis yAxisId="conf" orientation="right" domain={[0, 100]} width={34} tick={{ fontSize: 10, fill: '#66788a' }} tickFormatter={(v) => `${v}%`} />
              <Line yAxisId="conf" type="monotone" dataKey="confidence" name="Confidence %" stroke="#b04cf0" strokeWidth={2} strokeDasharray="2 3" dot={false} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <p className="chart-caption">
        Bars: inflows/outflows{showPo ? ' · orange: PO commitments' : ''}{showPipeline ? ' · teal: sales pipeline' : ''} · Blue line: closing cash ·
        {showBand ? ' shaded band: P10–P90' : ''}{showConfidence ? ' · purple dashed: confidence % (right axis)' : ''} · Amber dashed: policy buffer. Values shown in {currency} (display currency).
      </p>
    </div>
  );
}
