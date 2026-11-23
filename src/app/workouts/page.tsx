import { listWorkouts } from "@/actions/workouts";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function WorkoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const params = await searchParams;
  const limit = parseInt(params.limit ?? `${PAGE_SIZE}`) || PAGE_SIZE;
  const workouts = await listWorkouts(limit);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/progress"
        title="All Workouts"
        subtitle={`Showing ${workouts.length} most recent`}
        className="mb-4"
      />

      <div className="space-y-2">
        {workouts.length === 0 && (
          <p className="text-muted-foreground text-center py-8 text-sm">No workouts yet.</p>
        )}
        {workouts.map((w) => {
          const date = new Date(w.performed_on + "T12:00:00");
          const dateStr = date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return (
            <Link key={w.id} href={`/history/${w.id}`}>
              <Card className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{dateStr}</h3>
                    <p className="text-xs text-muted-foreground">
                      {w.exerciseCount} ex · {w.setCount} sets
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="m9 18 6-6-6-6" /></svg>
                </div>
              </Card>
            </Link>
          );
        })}

        {workouts.length === limit && (
          <div className="pt-4">
            <Link
              href={`/workouts?limit=${limit + PAGE_SIZE}`}
              className="block w-full text-center p-3 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            >
              Load {PAGE_SIZE} more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
