"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { formatVolumeAxis } from "@/lib/format";

type Week = {
  weekLabel: string;
  push: number;
  pull: number;
  legs: number;
  core: number;
  other: number;
};

const COLORS = {
  push: "#f87171", // red — push muscles
  pull: "#60a5fa", // blue — pull muscles
  legs: "#34d399", // green — legs
  core: "#fbbf24", // amber — core
  other: "#a1a1aa", // gray — uncategorized
};

export function BodyPartChart({ data }: { data: Week[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" vertical={false} />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          width={40}
          tickFormatter={formatVolumeAxis}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0 0% 12%)",
            border: "1px solid hsl(0 0% 20%)",
            borderRadius: "8px",
            fontSize: "11px",
          }}
          labelStyle={{ color: "hsl(0 0% 80%)" }}
          formatter={(value, name) => [
            `${Number(value).toLocaleString()} lbs`,
            String(name).charAt(0).toUpperCase() + String(name).slice(1),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
          iconType="square"
        />
        <Bar dataKey="push" stackId="a" fill={COLORS.push} name="Push" />
        <Bar dataKey="pull" stackId="a" fill={COLORS.pull} name="Pull" />
        <Bar dataKey="legs" stackId="a" fill={COLORS.legs} name="Legs" />
        <Bar dataKey="core" stackId="a" fill={COLORS.core} name="Core" />
        <Bar dataKey="other" stackId="a" fill={COLORS.other} name="Other" />
      </BarChart>
    </ResponsiveContainer>
  );
}
