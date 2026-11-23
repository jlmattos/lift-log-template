import { getAsymmetryLeaderboard } from "@/actions/asymmetry";
import { AsymmetryLeaderboard } from "@/components/asymmetry-leaderboard";
import { BackHeader } from "@/components/back-header";
import { PillNav } from "@/components/pill-nav";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 180, label: "180d" },
  { value: 365, label: "1y" },
];

export default async function AsymmetryPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const params = await searchParams;
  const req = parseInt(params.window ?? "90");
  const daysBack = WINDOWS.find((w) => w.value === req) ? req : 90;

  const { rows } = await getAsymmetryLeaderboard(daysBack);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="Asymmetry Monitor"
        subtitle={`Best e1RM gap between L and R · last ${daysBack} days`}
      />

      {/* Window selector */}
      <PillNav
        padY="py-2.5"
        items={WINDOWS.map((opt) => ({
          href: `/asymmetry?window=${opt.value}`,
          label: opt.label,
          active: daysBack === opt.value,
        }))}
      />

      <AsymmetryLeaderboard rows={rows} windowDays={daysBack} />
    </div>
  );
}
