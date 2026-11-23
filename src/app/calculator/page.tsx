import { Card } from "@/components/ui/card";
import { OneRMCalculator } from "@/components/one-rm-calculator";
import { BackHeader } from "@/components/back-header";

export const dynamic = "force-dynamic";

export default function CalculatorPage() {
  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader
        backHref="/more"
        title="1RM Calculator"
        subtitle="Same Epley formula used across all e1RM calculations in the app"
      />

      <OneRMCalculator />

      <Card className="p-3 text-[11px] text-muted-foreground">
        <p className="font-semibold text-foreground mb-1">Formula</p>
        <p>e1RM = weight × (1 + reps / 30)</p>
        <p className="mt-1.5">
          Epley is reliable for 1–10 reps. Above 10 reps the estimate gets noisy
          because rep performance varies more by training style. For your
          off-failure training, the estimate is conservative — add 1–3 reps to
          the input rep count to account for RIR.
        </p>
      </Card>
    </div>
  );
}
