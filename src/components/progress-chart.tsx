"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function ProgressChart({
  data,
}: {
  data: { date: string; load: number }[];
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
        <Line
          type="monotone"
          dataKey="load"
          stroke="#a1a1aa"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Load (lbs)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
