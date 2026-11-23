import { getTemplate } from "@/actions/templates";
import { listExercises } from "@/actions/exercises";
import { TemplateEditor } from "@/components/template-editor";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const [template, allExercises] = await Promise.all([
    getTemplate(templateId),
    listExercises(),
  ]);

  if (!template) {
    return (
      <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
        <p>Template not found.</p>
        <Link href="/templates" className="text-primary underline">
          Back to templates
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/templates"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{template.name}</h1>
          {(template as { category?: string | null }).category && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {(template as { category?: string | null }).category}
            </p>
          )}
        </div>
      </div>

      {/* Notes card ("How this template works") + exercise list, editable */}
      <TemplateEditor template={template} allExercises={allExercises} />
    </div>
  );
}
