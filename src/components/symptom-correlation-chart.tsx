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
} from "recharts";
import type { CorrelationDay } from "@/actions/correlation";
import { formatVolumeAxis } from "@/lib/format";

type Props = {
  days: CorrelationDay[];
  areaName: string;
};

function dayLabel(date: string): string {
  const d = new Date(date + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SymptomCorrelationChart({ days, areaName }: Props) {
  const data = days.map((d) => ({
    date: dayLabel(d.date),
    fullDate: d.date,
    severity: d.severity,
    relevantVolume: Math.round(d.relevantVolume),
    otherVolume: Math.round(d.otherVolume),
    sleep: d.sleep,
    bodyParts: d.bodyPartsTrained.join(", "),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 20%)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          yAxisId="severity"
          domain={[0, 5]}
          ticks={[0, 1, 2, 3, 4, 5]}
          tick={{ fontSize: 10, fill: "#fb923c" }}
          stroke="#fb923c"
          width={20}
        />
        <YAxis
          yAxisId="volume"
          orientation="right"
          tick={{ fontSize: 10, fill: "hsl(0 0% 60%)" }}
          stroke="hsl(0 0% 20%)"
          width={42}
          tickFormatter={formatVolumeAxis}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content={({ active, payload }: any) => {
            if (!active || !payload || !payload.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-card border border-border rounded-md p-2 text-xs space-y-1">
                <div className="font-semibold">{d.fullDate}</div>
                {d.severity !== null && (
                  <div className="text-orange-300">{areaName}: <strong>severity {d.severity}/5</strong></div>
                )}
                {d.relevantVolume > 0 && (
                  <div className="text-blue-300">
                    Relevant volume: <strong>{d.relevantVolume.toLocaleString()}</strong> lbs
                  </div>
                )}
                {d.otherVolume > 0 && (
                  <div className="text-muted-foreground">
                    Other volume: {d.otherVolume.toLocaleString()} lbs
                  </div>
                )}
                {d.bodyParts && <div className="text-muted-foreground">Trained: {d.bodyParts}</div>}
                {d.sleep && <div className="text-amber-300">⚠ Sleep affected</div>}
              </div>
            );
          }}
        />

        {/* Other-body-part volume — muted gray, stacked behind relevant */}
        <Bar
          yAxisId="volume"
          dataKey="otherVolume"
          fill="#3f3f46"
          stackId="vol"
        />
        {/* Relevant body-part volume — blue, foregrounded */}
        <Bar
          yAxisId="volume"
          dataKey="relevantVolume"
          fill="#60a5fa"
          stackId="vol"
        />

        {/* Severity line */}
        <Line
          yAxisId="severity"
          type="monotone"
          dataKey="severity"
          stroke="#fb923c"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#fb923c" }}
          name="Severity"
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
