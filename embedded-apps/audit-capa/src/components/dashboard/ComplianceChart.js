import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ComplianceChart({
  data,
}) {
  return (
    <ResponsiveContainer
      width="100%"
      height={350}
    >
      <LineChart data={data}>
        <XAxis dataKey="month" />

        <YAxis />

        <Tooltip />

        <Line
          type="monotone"
          dataKey="compliance"
          stroke="#7C3AED"
          strokeWidth={3}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}