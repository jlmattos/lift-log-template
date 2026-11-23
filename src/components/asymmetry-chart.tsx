"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function AsymmetryChart({
  data,
}: {
  data: { date: string; left: number; right: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          width={40}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0 0% 12%)",
            border: "1px solid hsl(0 0% 20%)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          labelStyle={{ color: "hsl(0 0% 80%)" }}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px" }}
        />
        <Line
          type="monotone"
          dataKey="left"
          stroke="#60a5fa"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Left"
        />
        <Line
          type="monotone"
          dataKey="right"
          stroke="#fb923c"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Right"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
