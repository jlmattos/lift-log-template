"use client";

import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card } from "@/components/ui/card";
import { getDigestInsights } from "@/actions/digest-insights";

export function DigestInsights({ markdown }: { markdown: string }) {
  const [insights, setInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      try {
        const { text } = await getDigestInsights(markdown);
        setInsights(text);
      } catch {
        setError("Couldn't generate insights — try again.");
      }
    });
  }

  if (insights) {
    return (
      <Card className="p-4 bg-blue-400/5 border-blue-400/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs uppercase tracking-wider text-blue-300 font-semibold">
            ✨ AI Insights
          </p>
          <button
            onClick={generate}
            disabled={isPending}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {isPending ? "…" : "↻ Regenerate"}
          </button>
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{insights}</ReactMarkdown>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={isPending}
        className="w-full bg-blue-400/10 border border-blue-400/30 text-blue-200 rounded-lg py-2.5 text-sm font-medium hover:bg-blue-400/20 transition-colors disabled:opacity-60"
      >
        {isPending ? "Analyzing your week…" : "✨ Get AI insights"}
      </button>
      {error && <p className="text-xs text-red-300 mt-2 text-center">{error}</p>}
    </div>
  );
}
