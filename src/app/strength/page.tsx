import { getStrengthDashboard } from "@/actions/strength";
import { listExercises } from "@/actions/exercises";
import { StrengthDashboard } from "@/components/strength-dashboard";
import { BackHeader } from "@/components/back-header";

export const dynamic = "force-dynamic";

export default async function StrengthPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const windowKey: "90d" | "all" = params.window === "all" ? "all" : "90d";

  const [dashboard, allExercises] = await Promise.all([
    getStrengthDashboard(windowKey),
    listExercises(),
  ]);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/progress"
        title="Strength Standards"
        subtitle="Your benchmark lifts vs StrengthLevel tiers"
        className="mb-4"
      />

      <StrengthDashboard dashboard={dashboard} allExercises={allExercises} />
    </div>
  );
}
