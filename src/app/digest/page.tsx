import { getWeeklyDigest } from "@/actions/digest";
import { DigestView } from "@/components/digest-view";
import { BackHeader } from "@/components/back-header";

export const dynamic = "force-dynamic";

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const weekOffset = Math.max(0, parseInt(params.week ?? "0") || 0);
  const digest = await getWeeklyDigest(weekOffset);

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <BackHeader
        backHref="/progress"
        title="Weekly Digest"
        subtitle="Markdown export for sharing with your CoS or external tools"
        className="mb-4"
      />

      <DigestView digest={digest} weekOffset={weekOffset} />
    </div>
  );
}
