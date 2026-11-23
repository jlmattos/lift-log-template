import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getProfile, getLatestBodyweight } from "@/actions/strength";
import { listInjuryAreas } from "@/actions/symptoms";
import { getUserContext } from "@/actions/user-context";
import { ProfileEditor } from "@/components/profile-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [profile, bw, injuries, context] = await Promise.all([
    getProfile(),
    getLatestBodyweight(),
    listInjuryAreas(),
    getUserContext(),
  ]);

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="About Me"
        subtitle="Personal context the AI advisor uses to understand you"
      />

      {/* Personal basics — readonly summary linking to existing editors */}
      <Card className="p-4">
        <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Basics</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Sex</p>
            <p className="font-medium capitalize">{profile.sex ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Bodyweight</p>
            <p className="font-medium tabular-nums">
              {bw ? `${bw.weight_lbs} lbs` : "Not logged"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Edit on <Link href="/strength" className="underline">Strength Standards</Link>.
        </p>
      </Card>

      <ProfileEditor injuries={injuries} context={context} />
    </div>
  );
}
