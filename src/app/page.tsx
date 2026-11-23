import { getTodayWorkoutWithSets } from "@/actions/workouts";
import { getNextPlannedWorkout } from "@/actions/routines";
import { getLastSessionsForExercises, getTodaysPRs } from "@/actions/sets";
import { getCheckinsForDate } from "@/actions/symptoms";
import { getDailyBriefing, getDailyBriefingLite } from "@/actions/briefing";
import { TodayView } from "@/components/today-view";
import { DailyCheckinCard } from "@/components/daily-checkin-card";
import { DailyBriefing } from "@/components/daily-briefing";
import { WorkoutNotes } from "@/components/workout-notes";
import { CancelWorkoutButton } from "@/components/cancel-workout-button";
import { formatDuration, computeWorkoutDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [data, routineNext, checkins] = await Promise.all([
    getTodayWorkoutWithSets(),
    getNextPlannedWorkout(),
    getCheckinsForDate(),
  ]);

  // Mid-workout the briefing renders as a compact pill, so skip the six heavy
  // sub-reports it doesn't show — this page re-renders after EVERY logged set
  // (router.refresh), and the lite path keeps that refresh fast.
  const midWorkout = !!data && data.exercises.length > 0;
  const briefing = midWorkout ? await getDailyBriefingLite() : await getDailyBriefing();

  // Build list of all exercise IDs visible on Today page (logged + planned + next-up preview)
  const exerciseIds = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?.exercises?.forEach((e: any) => exerciseIds.add(e.exercise.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?.template?.plannedExercises?.forEach((e: any) => exerciseIds.add(e.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  routineNext?.next?.exercises?.forEach((e: any) => exerciseIds.add(e.id));

  const lastSessions =
    exerciseIds.size > 0
      ? await getLastSessionsForExercises(
          Array.from(exerciseIds),
          data?.workout?.id
        )
      : {};

  // PR detection for today's logged exercises
  const loggedExerciseInfo =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?.exercises?.map((e: any) => ({
      id: e.exercise.id,
      isUnilateral: e.exercise.is_unilateral,
    })) ?? [];

  const todaysPRs =
    data?.workout?.id && loggedExerciseInfo.length > 0
      ? await getTodaysPRs(data.workout.id, loggedExerciseInfo)
      : {};

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Workout duration (computed from set timestamps)
  const allSets =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?.exercises?.flatMap((e: any) => e.sets) ?? [];
  const durationSec = computeWorkoutDuration(allSets);
  const durationStr = formatDuration(durationSec);

  // "Active workout" = some sets already logged. Pre-workout / empty-shell state shows full briefing.
  const isMidWorkout = midWorkout;

  // Scheduled rest day: an active routine is running (not pre-start), today's
  // calendar slot has no strength template and no cardio prescription, and
  // nothing's been logged yet. In that case TodayView offers skip/take options.
  const isRestDay = !data && !briefing.planned && !!routineNext?.next;

  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">{dateStr}</h1>
      <p className="text-muted-foreground text-sm mt-1">
        {data
          ? `${data.exercises.length} exercise${data.exercises.length !== 1 ? "s" : ""} logged${durationStr ? ` · ${durationStr}` : ""}`
          : "No workout yet today"}
      </p>

      {/* Daily briefing: full stack pre-workout, compact pill mid-workout */}
      <DailyBriefing briefing={briefing} compact={isMidWorkout} />

      {checkins.areas.length > 0 && (
        <div className="mt-4">
          <DailyCheckinCard
            date={checkins.date}
            areas={checkins.areas}
            checkinsByArea={checkins.checkinsByArea}
          />
        </div>
      )}

      <TodayView
        data={data}
        routineNext={routineNext}
        lastSessions={lastSessions}
        todaysPRs={todaysPRs}
        isRestDay={isRestDay}
      />

      {/* Workout notes — only show if there's a workout in progress */}
      {data?.workout && (
        <div className="mt-4 mb-2">
          <WorkoutNotes
            workoutId={data.workout.id}
            initialNotes={data.workout.notes ?? null}
            compact
          />
        </div>
      )}

      {/* Cancel button — only when workout exists but no sets logged (started by mistake escape hatch) */}
      {data?.workout && data.exercises.length === 0 && (
        <div className="mt-4 mb-6">
          <CancelWorkoutButton workoutId={data.workout.id} />
        </div>
      )}
    </div>
  );
}
