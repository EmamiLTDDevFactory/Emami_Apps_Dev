import {
  PieChart,
  Pie,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#ff9800",
  "#4caf50",
];

export default function AuditStatusChart({
  data,
}) {
  return (
    <ResponsiveContainer
      width="100%"
      height={350}
    >
      <PieChart>
        <Pie
          data={data}
          label
          dataKey="value"
        >
          {data.map(
            (_, index) => (
              <Cell
                key={index}
                fill={
                  COLORS[index]
                }
              />
            )
          )}
        </Pie>

        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}