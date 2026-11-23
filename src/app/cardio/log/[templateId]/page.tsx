import Link from "next/link";
import { todayLocal } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { BackHeader } from "@/components/back-header";
import { getCardioTemplate, findMatchingStravaSession } from "@/actions/cardio-templates";
import { getTodayPlannedSession } from "@/actions/routines";
import { CardioLogForm } from "@/components/cardio-log-form";
import { PrescriptionMarkdown } from "@/components/prescription-markdown";

export const dynamic = "force-dynamic";

export default async function CardioLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { templateId } = await params;
  const sp = await searchParams;
  const date = sp.date ?? todayLocal();

  const template = await getCardioTemplate(templateId);
  if (!template) {
    return (
      <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6">
        <p className="text-sm text-muted-foreground">Template not found.</p>
        <Link href="/cardio" className="text-blue-300 underline text-sm">Back to cardio</Link>
      </div>
    );
  }

  const [matched, plannedToday] = await Promise.all([
    findMatchingStravaSession(templateId, date),
    getTodayPlannedSession(),
  ]);

  // If today's planned session uses this template, surface the week-specific protocol notes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const todayUsesThisTemplate = plannedToday?.day && (plannedToday.day as any).cardio_template_id === templateId;
  const todayNotes = todayUsesThisTemplate ? plannedToday?.day?.notes : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentWeek = (plannedToday?.routine as any)?.current_week as number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalWeeks = (plannedToday?.routine as any)?.weeks as number | undefined;

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <BackHeader backHref="/" title={`Log ${template.name}`} subtitle={date} />

      {/* TODAY'S SPECIFIC PROTOCOL — surfaced when this matches today's routine slot */}
      {todayNotes && (
        <Card className="p-3 bg-blue-400/10 border-blue-400/40 border-2">
          <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold mb-1">
            🎯 Today&apos;s protocol {currentWeek && totalWeeks ? `· Week ${currentWeek}/${totalWeeks}` : ""}
          </p>
          <PrescriptionMarkdown content={todayNotes} />
        </Card>
      )}

      {/* Full template prescription — markdown-rendered for structure */}
      {template.prescription_notes && (
        <Card className="p-3 bg-blue-400/5 border-blue-400/30">
          <p className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold mb-1">
            How this session works
          </p>
          <PrescriptionMarkdown content={template.prescription_notes} />
        </Card>
      )}

      <CardioLogForm template={template} date={date} matchedStravaSession={matched} />
    </div>
  );
}
