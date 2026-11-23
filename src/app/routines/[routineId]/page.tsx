import { getRoutine } from "@/actions/routines";
import { listTemplates } from "@/actions/templates";
import { listCardioTemplates } from "@/actions/cardio-templates";
import { RoutineEditor } from "@/components/routine-editor";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RoutineDetailPage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = await params;
  const [routine, templates, cardioTemplates] = await Promise.all([
    getRoutine(routineId),
    listTemplates(),
    listCardioTemplates(),
  ]);

  if (!routine) {
    return (
      <div className="max-w-md lg:max-w-5xl mx-auto px-4 pt-6">
        <p>Routine not found.</p>
        <Link href="/routines" className="text-primary underline">
          Back to routines
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/routines"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">{routine.name}</h1>
          <p className="text-xs text-muted-foreground">
            {routine.weeks} week{routine.weeks !== 1 ? "s" : ""} ·{" "}
            {routine.is_active ? (
              <span className="text-blue-300 font-medium">Active</span>
            ) : (
              "Inactive"
            )}
          </p>
        </div>
      </div>

      <RoutineEditor routine={routine} templates={templates} cardioTemplates={cardioTemplates} />
    </div>
  );
}
