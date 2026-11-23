"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  logBodyweight,
  setProfileSex,
  addBenchmark,
  removeBenchmark,
} from "@/actions/strength";
import {
  STANDARD_LIFT_LABELS,
  TIER_COLORS,
  ADD_BODYWEIGHT_LIFTS,
  type StandardLift,
  type Tier,
} from "@/lib/strength-standards";
import { roundE1RM } from "@/lib/e1rm";

type Exercise = {
  id: string;
  name: string;
  equipment_type?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function StrengthDashboard({ dashboard, allExercises }: { dashboard: any; allExercises: Exercise[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bwOpen, setBwOpen] = useState(false);
  const [bwInput, setBwInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [pickedExerciseId, setPickedExerciseId] = useState<string>("");
  const [pickedStandard, setPickedStandard] = useState<StandardLift | "">("");
  const [search, setSearch] = useState("");

  function handleSetSex(sex: "male" | "female") {
    startTransition(async () => {
      await setProfileSex(sex);
      router.refresh();
    });
  }

  function handleLogBodyweight() {
    const v = parseFloat(bwInput);
    if (!v || v <= 0) return;
    startTransition(async () => {
      await logBodyweight(v);
      setBwOpen(false);
      setBwInput("");
      router.refresh();
    });
  }

  function handleAddBenchmark() {
    if (!pickedExerciseId || !pickedStandard) return;
    startTransition(async () => {
      await addBenchmark(pickedExerciseId, pickedStandard as StandardLift);
      setAddOpen(false);
      setPickedExerciseId("");
      setPickedStandard("");
      setSearch("");
      router.refresh();
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await removeBenchmark(id);
      router.refresh();
    });
  }

  // ─── SETUP FLOW ───────────────────────────────────────────────────
  if (dashboard.needsSetup) {
    return (
      <div className="space-y-4 mt-4">
        <Card className="p-4 border-blue-400/40 bg-blue-400/5 border-2">
          <h2 className="font-semibold mb-1">Setup needed</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Three quick steps to unlock your strength dashboard:
          </p>

          {/* Step 1: Sex */}
          <div className="space-y-2 mb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              1. Sex {dashboard.profile.sex && <span className="text-emerald-400">✓</span>}
            </p>
            {dashboard.profile.sex ? (
              <p className="text-sm">{dashboard.profile.sex === "male" ? "Male" : "Female"} <button onClick={() => handleSetSex(dashboard.profile.sex === "male" ? "female" : "male")} className="text-xs text-muted-foreground ml-2 hover:text-foreground">change</button></p>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => handleSetSex("male")} variant="outline" className="flex-1">Male</Button>
                <Button onClick={() => handleSetSex("female")} variant="outline" className="flex-1">Female</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Used to look up appropriate tier thresholds.
            </p>
          </div>

          {/* Step 2: Bodyweight */}
          <div className="space-y-2 mb-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              2. Bodyweight {dashboard.bodyweight && <span className="text-emerald-400">✓</span>}
            </p>
            {dashboard.bodyweight ? (
              <p className="text-sm">
                {dashboard.bodyweight.weight_lbs} lbs
                <button onClick={() => setBwOpen(true)} className="text-xs text-muted-foreground ml-2 hover:text-foreground">update</button>
              </p>
            ) : (
              <Button onClick={() => setBwOpen(true)} variant="outline" className="w-full">
                Log current bodyweight
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Standards are bodyweight-relative. Update weekly for accurate ratios.
            </p>
          </div>

          {/* Step 3: Benchmarks */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              3. Benchmark lifts {dashboard.setupMissing.benchmarks ? "" : <span className="text-emerald-400">✓</span>}
            </p>
            <Button
              onClick={() => setAddOpen(true)}
              variant={dashboard.setupMissing.benchmarks ? "default" : "outline"}
              className="w-full"
            >
              {dashboard.setupMissing.benchmarks ? "Pick your benchmark lifts" : "Add another"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Map your exercises to standard lift names (e.g., your &ldquo;Bench Press&rdquo; → standard Bench Press).
            </p>
          </div>
        </Card>

        <BodyweightSheet open={bwOpen} onOpenChange={setBwOpen} value={bwInput} onChange={setBwInput} onSave={handleLogBodyweight} isPending={isPending} />
        <AddBenchmarkSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          allExercises={allExercises}
          existing={dashboard.benchmarks ?? []}
          pickedExerciseId={pickedExerciseId}
          setPickedExerciseId={setPickedExerciseId}
          pickedStandard={pickedStandard}
          setPickedStandard={setPickedStandard}
          search={search}
          setSearch={setSearch}
          onSave={handleAddBenchmark}
          isPending={isPending}
        />
      </div>
    );
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────
  const currentWindow: "90d" | "all" = dashboard.windowKey ?? "90d";

  return (
    <div className="space-y-3 mt-4">
      {/* Bodyweight header */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Bodyweight</p>
            <p className="text-xl font-bold">{Number(dashboard.bodyweight.weight_lbs).toFixed(1)} <span className="text-sm font-normal text-muted-foreground">lbs</span></p>
            <p className="text-xs text-muted-foreground">
              {new Date(dashboard.bodyweight.measured_on + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" · "}
              {dashboard.profile.sex === "male" ? "Male" : "Female"} standards
            </p>
          </div>
          <Button onClick={() => setBwOpen(true)} variant="outline" size="sm">
            Update
          </Button>
        </div>
      </Card>

      {/* Window toggle */}
      <div className="flex gap-1 bg-muted/40 rounded-md p-1">
        <Link
          href="/strength?window=90d"
          className={`flex-1 text-center text-sm py-3 rounded transition-colors ${
            currentWindow === "90d"
              ? "bg-blue-400 text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Last 90 days
        </Link>
        <Link
          href="/strength?window=all"
          className={`flex-1 text-center text-sm py-3 rounded transition-colors ${
            currentWindow === "all"
              ? "bg-blue-400 text-background font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          All-time best
        </Link>
      </div>
      <p className="text-xs text-muted-foreground px-1">
        {currentWindow === "90d"
          ? "Shows your best from the past 90 days — what you can do right now."
          : "Shows your peak ever — aspirational benchmark."}
      </p>

      {/* Benchmark cards */}
      {dashboard.benchmarks.map((b: {
        id: string;
        exercise_id: string;
        standard_lift: StandardLift;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exercise: any;
        best: { e1rm: number; reps: number; load: number; date: string } | null;
        adjustedE1RM?: number;
        tier: { ratio: number; tier: Tier; nextTier: Tier | null; thresholdToNext: number | null; pctToNext: number } | null;
      }) => {
        if (!b.best || !b.tier) {
          return (
            <Card key={b.id} className="p-3 border-dashed">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{STANDARD_LIFT_LABELS[b.standard_lift]}</p>
                  <p className="text-xs text-muted-foreground">
                    Mapped to &ldquo;{b.exercise.name}&rdquo; · no sets logged yet
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(b.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
                >
                  Remove
                </button>
              </div>
            </Card>
          );
        }

        const colors = TIER_COLORS[b.tier.tier];
        const addsBW = ADD_BODYWEIGHT_LIFTS.includes(b.standard_lift);
        const displayE1RM = b.adjustedE1RM ?? b.best.e1rm;

        return (
          <Card key={b.id} className={`p-4 ${colors.bg} ${colors.border} border-2`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{STANDARD_LIFT_LABELS[b.standard_lift]}</p>
                <p className="text-xs text-muted-foreground">
                  via &ldquo;{b.exercise.name}&rdquo;
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${colors.text} ${colors.bg}`}>
                {colors.label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">e1RM</p>
                <p className="text-2xl font-bold">
                  {roundE1RM(displayE1RM)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">lbs</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  from {b.best.reps}×{b.best.load}
                  {addsBW ? ` (+bw)` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">×Bodyweight</p>
                <p className="text-2xl font-bold">
                  {b.tier.ratio.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">×</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(b.best.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>

            {/* Progress bar to next tier */}
            <div className="mt-3 pt-3 border-t border-border/30">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`font-semibold ${colors.text}`}>{colors.label}</span>
                {b.tier.nextTier && b.tier.thresholdToNext ? (
                  <span className="text-muted-foreground">
                    {TIER_COLORS[b.tier.nextTier].label}: {roundE1RM(b.tier.thresholdToNext)} lbs
                  </span>
                ) : (
                  <span className={`${colors.text} font-semibold`}>Max tier 🏆</span>
                )}
              </div>
              <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.text.replace("text-", "bg-")} transition-all`}
                  style={{ width: `${b.tier.pctToNext}%` }}
                />
              </div>
              {b.tier.nextTier && b.tier.thresholdToNext && (
                <p className="text-xs text-muted-foreground mt-1">
                  +{roundE1RM(b.tier.thresholdToNext - displayE1RM)} lbs to next tier
                </p>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between">
              <Link
                href={`/exercises/${b.exercise_id}`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Exercise detail →
              </Link>
              <button
                onClick={() => handleRemove(b.id)}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Remove
              </button>
            </div>
          </Card>
        );
      })}

      <Button
        onClick={() => setAddOpen(true)}
        variant="outline"
        className="w-full h-12 border-dashed text-muted-foreground"
      >
        + Add benchmark lift
      </Button>

      <BodyweightSheet open={bwOpen} onOpenChange={setBwOpen} value={bwInput} onChange={setBwInput} onSave={handleLogBodyweight} isPending={isPending} />
      <AddBenchmarkSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        allExercises={allExercises}
        existing={dashboard.benchmarks ?? []}
        pickedExerciseId={pickedExerciseId}
        setPickedExerciseId={setPickedExerciseId}
        pickedStandard={pickedStandard}
        setPickedStandard={setPickedStandard}
        search={search}
        setSearch={setSearch}
        onSave={handleAddBenchmark}
        isPending={isPending}
      />
    </div>
  );
}

// ─── Sub-sheets ────────────────────────────────────────────────────

function BodyweightSheet({
  open, onOpenChange, value, onChange, onSave, isPending,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; value: string;
  onChange: (v: string) => void; onSave: () => void; isPending: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Log Bodyweight</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Weight (lbs)</Label>
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="175"
              autoFocus
              className="h-12 text-center text-lg"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Logs for today. Re-log overwrites the existing entry for today.
            </p>
          </div>
          <Button onClick={onSave} disabled={!parseFloat(value) || isPending} className="w-full h-12">
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddBenchmarkSheet({
  open, onOpenChange, allExercises, existing, pickedExerciseId, setPickedExerciseId,
  pickedStandard, setPickedStandard, search, setSearch, onSave, isPending,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; allExercises: Exercise[];
  existing: { exercise_id: string }[];
  pickedExerciseId: string; setPickedExerciseId: (v: string) => void;
  pickedStandard: StandardLift | ""; setPickedStandard: (v: StandardLift | "") => void;
  search: string; setSearch: (v: string) => void;
  onSave: () => void; isPending: boolean;
}) {
  const existingIds = new Set(existing.map((b) => b.exercise_id));
  const filtered = allExercises.filter(
    (e) => !existingIds.has(e.id) && (search === "" || e.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Benchmark Lift</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {/* Pick exercise */}
          <div>
            <Label className="text-xs">1. Pick your exercise</Label>
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
            <div className="space-y-1 mt-2 max-h-[35vh] overflow-y-auto">
              {filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => setPickedExerciseId(ex.id)}
                  className={`w-full text-left p-2.5 rounded border transition-colors ${
                    pickedExerciseId === ex.id
                      ? "border-blue-400 bg-blue-400/10"
                      : "border-border hover:bg-accent/30"
                  }`}
                >
                  <span className="text-sm">{ex.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No exercises match</p>
              )}
            </div>
          </div>

          {/* Pick standard */}
          <div>
            <Label className="text-xs">2. Map to standard lift</Label>
            <select
              value={pickedStandard}
              onChange={(e) => setPickedStandard(e.target.value as StandardLift | "")}
              className="w-full mt-1 h-10 px-3 text-sm bg-background border border-input rounded-md"
            >
              <option value="">— pick a standard —</option>
              {Object.entries(STANDARD_LIFT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Pull-Ups, Chin-Ups, Dips: enter the ADDED weight when logging. Bodyweight is added automatically.
            </p>
          </div>

          <Button onClick={onSave} disabled={!pickedExerciseId || !pickedStandard || isPending} className="w-full h-12">
            {isPending ? "Adding..." : "Add Benchmark"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
