"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatVolume } from "@/lib/format";
import { DigestInsights } from "@/components/digest-insights";

type Digest = {
  range: { start: string; end: string; startLabel: string; endLabel: string };
  markdown: string;
  stats: { sessions: number; sets: number; volume: number; prs: number };
};

export function DigestView({
  digest,
  weekOffset,
}: {
  digest: Digest;
  weekOffset: number;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(digest.markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([digest.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lift-log-digest-${digest.range.start}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function goPrev() {
    router.push(`/digest?week=${weekOffset + 1}`);
  }
  function goNext() {
    if (weekOffset <= 0) return;
    router.push(`/digest?week=${weekOffset - 1}`);
  }

  const weekLabel =
    weekOffset === 0
      ? "This week"
      : weekOffset === 1
        ? "Last week"
        : `${weekOffset} weeks ago`;

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            ← Older
          </button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">{weekLabel}</p>
            <p className="text-sm font-medium">
              {digest.range.startLabel} – {digest.range.endLabel}
            </p>
          </div>
          <button
            onClick={goNext}
            disabled={weekOffset <= 0}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Newer →
          </button>
        </div>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{digest.stats.sessions}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Sessions</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{digest.stats.sets}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Sets</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{formatVolume(digest.stats.volume)}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Volume</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xl font-bold">{digest.stats.prs}</p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">PRs</p>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleCopy} className="h-12">
          {copied ? "✓ Copied!" : "📋 Copy Markdown"}
        </Button>
        <Button onClick={handleDownload} variant="outline" className="h-12">
          ⬇ Download .md
        </Button>
      </div>

      {/* Proactive AI insights (on-demand) */}
      <DigestInsights markdown={digest.markdown} />

      {/* Preview */}
      <Card className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Preview
        </p>
        <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed overflow-x-auto">
          {digest.markdown}
        </pre>
      </Card>
    </div>
  );
}
