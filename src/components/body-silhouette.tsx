"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { MuscleVolume } from "@/actions/silhouette";
import type { StrengthByMuscle } from "@/actions/strength-heatmap";
import { bodyPartLabel } from "@/lib/body-parts";
import { STANDARD_LIFT_LABELS, type Tier } from "@/lib/strength-standards";
import type { IExerciseData, IMuscleStats, Muscle } from "react-body-highlighter";

const Model = dynamic(() => import("react-body-highlighter"), { ssr: false });

type Mode = "volume" | "strength";

type Props = {
  mode: Mode;
  byMuscle: Record<string, MuscleVolume>;
  totalVolume: number;
  windowDays: number; // -1 sentinel = all-time
  strengthByMuscle: Record<string, StrengthByMuscle>;
  strengthSetupNeeded: boolean;
};

const windowLabel = (d: number) => (d < 0 ? "all time" : `last ${d}d`);

// Volume mode: orange ramp (untrained → most-trained)
const VOLUME_COLORS = ["#4a4a4a", "#7a2e1f", "#c54a1a", "#e85d18", "#ff7a3a"];
// Strength mode: distinct hues so adjacent tiers are clearly different.
// Red → Orange → Yellow → Green → Blue (elite gets a hue jump so it pops)
const STRENGTH_COLORS = ["#dc2626", "#f97316", "#facc15", "#22c55e", "#2563eb"];
const STRENGTH_TIER_LABELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const BODY_COLOR = "#3a3a3a";

const BODY_PART_TO_MUSCLES: Record<string, Muscle[]> = {
  chest: ["chest"],
  shoulders: ["front-deltoids", "back-deltoids"],
  triceps: ["triceps"],
  back: ["upper-back", "lower-back", "trapezius"],
  biceps: ["biceps"],
  forearms: ["forearm"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  core: ["abs", "obliques"],
  full_body: [
    "chest", "front-deltoids", "back-deltoids", "biceps", "triceps", "forearm",
    "upper-back", "lower-back", "trapezius", "abs", "obliques",
    "quadriceps", "hamstring", "gluteal", "calves",
  ],
  push: ["chest", "front-deltoids", "triceps"],
  pull: ["upper-back", "biceps", "trapezius"],
  legs: ["quadriceps", "hamstring", "gluteal", "calves"],
};

const MUSCLE_TO_BODY_PART: Record<string, string> = {
  "chest": "chest",
  "front-deltoids": "shoulders",
  "back-deltoids": "shoulders",
  "triceps": "triceps",
  "upper-back": "back",
  "lower-back": "back",
  "trapezius": "back",
  "biceps": "biceps",
  "forearm": "forearms",
  "quadriceps": "quads",
  "hamstring": "hamstrings",
  "gluteal": "glutes",
  "calves": "calves",
  "abs": "core",
  "obliques": "core",
};

function volumeBucket(ratio: number): number {
  if (ratio <= 0) return 0;
  if (ratio < 0.15) return 1;
  if (ratio < 0.30) return 2;
  if (ratio < 0.50) return 3;
  if (ratio < 0.75) return 4;
  return 5;
}

const TIER_TO_LEVEL: Record<Tier, number> = {
  beginner: 1,
  novice: 2,
  intermediate: 3,
  advanced: 4,
  elite: 5,
};

export function BodySilhouette({
  mode,
  byMuscle,
  totalVolume,
  windowDays,
  strengthByMuscle,
  strengthSetupNeeded,
}: Props) {
  const [view, setView] = useState<"anterior" | "posterior">("anterior");
  const [selected, setSelected] = useState<string | null>(null);

  const maxVolume = Math.max(...Object.values(byMuscle).map((m) => m.volume), 1);
  const colors = mode === "volume" ? VOLUME_COLORS : STRENGTH_COLORS;

  // Build the highlighter data based on mode
  const data: IExerciseData[] = useMemo(() => {
    const out: IExerciseData[] = [];
    if (mode === "volume") {
      for (const [bp, mv] of Object.entries(byMuscle)) {
        const muscles = BODY_PART_TO_MUSCLES[bp];
        if (!muscles || mv.volume <= 0) continue;
        const level = volumeBucket(mv.volume / maxVolume);
        if (level === 0) continue;
        out.push({ name: bodyPartLabel(bp), muscles, frequency: level });
      }
    } else {
      for (const [bp, sm] of Object.entries(strengthByMuscle)) {
        const muscles = BODY_PART_TO_MUSCLES[bp];
        if (!muscles) continue;
        const level = TIER_TO_LEVEL[sm.tier];
        out.push({ name: bodyPartLabel(bp), muscles, frequency: level });
      }
    }
    return out;
  }, [mode, byMuscle, strengthByMuscle, maxVolume]);

  const selectedVol = selected ? byMuscle[selected] : null;
  const selectedStr = selected ? strengthByMuscle[selected] : null;

  function handleMuscleClick(stats: IMuscleStats) {
    const bp = MUSCLE_TO_BODY_PART[stats.muscle];
    if (bp) setSelected(bp);
  }

  // Setup nudge for strength mode
  if (mode === "strength" && strengthSetupNeeded) {
    return (
      <Card className="p-6 text-center space-y-3">
        <p className="text-sm">
          Strength heatmap needs your Strength Standards configured first.
        </p>
        <p className="text-xs text-muted-foreground">
          Set your sex, bodyweight, and which exercises to use as benchmarks.
        </p>
        <Link
          href="/strength"
          className="inline-block text-sm bg-blue-400 text-background font-medium px-4 py-2 rounded"
        >
          Set up Strength Standards
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Front / Back toggle */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        <button
          onClick={() => setView("anterior")}
          className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
            view === "anterior" ? "bg-blue-400 text-background font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >Front</button>
        <button
          onClick={() => setView("posterior")}
          className={`flex-1 text-center text-sm py-2 rounded transition-colors ${
            view === "posterior" ? "bg-blue-400 text-background font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >Back</button>
      </div>

      {/* Body model */}
      <div className="flex justify-center bg-muted/20 rounded-lg py-4">
        <Model
          type={view}
          data={data}
          bodyColor={BODY_COLOR}
          highlightedColors={colors}
          onClick={handleMuscleClick}
          style={{ width: "220px" }}
        />
      </div>

      {/* Legend */}
      {mode === "volume" ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex-1 flex gap-0.5">
            {[BODY_COLOR, ...VOLUME_COLORS].map((c) => (
              <div key={c} className="flex-1 h-2 rounded-sm" style={{ background: c }} />
            ))}
          </div>
          <span>More</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {STRENGTH_COLORS.map((c, i) => (
            <div key={c} className="flex-1 text-center">
              <div className="h-2 rounded-sm mb-0.5" style={{ background: c }} />
              {STRENGTH_TIER_LABELS[i]}
            </div>
          ))}
        </div>
      )}

      {/* Selected muscle detail */}
      {selected && (mode === "volume" ? selectedVol : selectedStr) && (
        <Card className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-semibold">{bodyPartLabel(selected)}</h3>
              {mode === "volume" && selectedVol && (
                <p className="text-xs text-muted-foreground">
                  {selectedVol.volume.toLocaleString()} lbs · {selectedVol.sets} sets · {windowLabel(windowDays)}
                </p>
              )}
              {mode === "strength" && selectedStr && (
                <p className="text-xs text-muted-foreground">
                  {STRENGTH_TIER_LABELS[selectedStr.tierLevel - 1]} · best e1RM {selectedStr.bestE1RM} lbs
                </p>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground text-sm"
              aria-label="Close"
            >✕</button>
          </div>
          {mode === "volume" && selectedVol && selectedVol.topExercises.length > 0 && (
            <div className="space-y-1 mt-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Top exercises</p>
              {selectedVol.topExercises.map((ex) => (
                <div key={ex.name} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{ex.name}</span>
                  <span className="text-muted-foreground shrink-0">{ex.volume.toLocaleString()} lbs</span>
                </div>
              ))}
            </div>
          )}
          {mode === "strength" && selectedStr && (
            <div className="mt-3 text-sm">
              <p>
                Via <span className="font-medium">{selectedStr.exerciseName}</span>{" "}
                <span className="text-muted-foreground">({STANDARD_LIFT_LABELS[selectedStr.standardLift]})</span>
              </p>
            </div>
          )}
        </Card>
      )}

      {/* List view */}
      {mode === "volume" ? (
        <Card className="p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            All muscles · {windowLabel(windowDays)}
          </h3>
          {Object.keys(byMuscle).length === 0 ? (
            <p className="text-sm text-muted-foreground">No volume logged in this window.</p>
          ) : (
            <div className="space-y-2">
              {Object.values(byMuscle).sort((a, b) => b.volume - a.volume).map((mv) => {
                const level = volumeBucket(mv.volume / maxVolume);
                const color = level === 0 ? BODY_COLOR : VOLUME_COLORS[level - 1];
                const pct = totalVolume > 0 ? Math.round((mv.volume / totalVolume) * 100) : 0;
                return (
                  <button
                    key={mv.muscle}
                    onClick={() => setSelected(mv.muscle)}
                    className="w-full flex items-center gap-3 text-left hover:bg-accent/40 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    <span className="text-sm flex-1 truncate">{bodyPartLabel(mv.muscle)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {mv.volume.toLocaleString()} · {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">
            Strength tier per muscle
          </h3>
          {Object.keys(strengthByMuscle).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No benchmark data yet. Set up benchmarks at{" "}
              <Link href="/strength" className="underline">/strength</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.values(strengthByMuscle).sort((a, b) => b.tierLevel - a.tierLevel).map((sm) => {
                const color = STRENGTH_COLORS[sm.tierLevel - 1];
                return (
                  <button
                    key={sm.bodyPart}
                    onClick={() => setSelected(sm.bodyPart)}
                    className="w-full flex items-center gap-3 text-left hover:bg-accent/40 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                    <span className="text-sm flex-1 truncate">{bodyPartLabel(sm.bodyPart)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {STRENGTH_TIER_LABELS[sm.tierLevel - 1]} · {sm.bestE1RM}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
