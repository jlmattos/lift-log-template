import { listTemplates } from "@/actions/templates";
import { TemplatesList } from "@/components/templates-list";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="max-w-md lg:max-w-4xl mx-auto px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
      <p className="text-muted-foreground text-sm mt-1">
        {templates.length} template{templates.length !== 1 ? "s" : ""}
      </p>

      <TemplatesList templates={templates} />
    </div>
  );
}
