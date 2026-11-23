"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { TSBDay } from "@/actions/tsb";

function dayLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TSBChart({ days }: { days: TSBDay[] }) {
  const data = days.map((d) => ({
    date: dayLabel(d.date),
    fullDate: d.date,
    ctl: d.ctl,
    atl: d.atl,
    tsb: d.tsb,
    load: d.totalLoad,
    strength: d.strengthLoad,
    cardio: d.cardioLoad,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          yAxisId="load"
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          width={32}
        />
        <YAxis
          yAxisId="tsb"
          orientation="right"
          tick={{ fontSize: 10, fill: "#22c55e" }}
          stroke="#22c55e"
          width={32}
        />
        <ReferenceLine yAxisId="tsb" y={0} stroke="#22c55e" strokeDasharray="2 2" strokeOpacity={0.4} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={({ active, payload }: any) => {
            if (!active || !payload || !payload.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-card border border-border rounded-md p-2 text-xs space-y-1">
                <div className="font-semibold">{d.fullDate}</div>
                <div className="text-blue-300">CTL (fitness): <strong>{d.ctl}</strong></div>
                <div className="text-orange-300">ATL (fatigue): <strong>{d.atl}</strong></div>
                <div className="text-emerald-300">TSB (form): <strong>{d.tsb}</strong></div>
                {d.load > 0 && (
                  <div className="text-muted-foreground">
                    Load: {d.load.toFixed(0)} ({d.strength.toFixed(0)} str + {d.cardio.toFixed(0)} cardio)
                  </div>
                )}
              </div>
            );
          }}
        />

        {/* Daily total load as faint bars in the background */}
        <Bar yAxisId="load" dataKey="load" fill="#404040" fillOpacity={0.5} />

        {/* CTL = fitness, slow-rolling */}
        <Line yAxisId="load" type="monotone" dataKey="ctl" stroke="#60a5fa" strokeWidth={2.5} dot={false} name="CTL" />
        {/* ATL = fatigue, fast-rolling */}
        <Line yAxisId="load" type="monotone" dataKey="atl" stroke="#fb923c" strokeWidth={2} dot={false} name="ATL" />
        {/* TSB = form, right axis */}
        <Line yAxisId="tsb" type="monotone" dataKey="tsb" stroke="#22c55e" strokeWidth={2} dot={false} name="TSB" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
