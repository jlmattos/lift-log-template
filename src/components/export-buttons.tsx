"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  generateFullExportJSON,
  generateSetsCSV,
  generateSymptomsCSV,
} from "@/actions/export";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

export function ExportButtons() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function handleSetsCSV() {
    setStatus("Generating sets CSV...");
    startTransition(async () => {
      const csv = await generateSetsCSV();
      download(`lift-log-sets-${today()}.csv`, csv, "text/csv");
      setStatus("✓ Downloaded sets CSV");
      setTimeout(() => setStatus(null), 3000);
    });
  }

  function handleSymptomsCSV() {
    setStatus("Generating symptoms CSV...");
    startTransition(async () => {
      const csv = await generateSymptomsCSV();
      download(`lift-log-symptoms-${today()}.csv`, csv, "text/csv");
      setStatus("✓ Downloaded symptoms CSV");
      setTimeout(() => setStatus(null), 3000);
    });
  }

  function handleFullJSON() {
    setStatus("Generating full backup...");
    startTransition(async () => {
      const json = await generateFullExportJSON();
      download(`lift-log-backup-${today()}.json`, json, "application/json");
      setStatus("✓ Downloaded full backup");
      setTimeout(() => setStatus(null), 3000);
    });
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h2 className="font-semibold mb-1">📊 Sets CSV</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Every logged set as one row. Compatible with Excel/Sheets and most lifting apps.
          Includes date, exercise, reps, load, RPE, side, notes, equipment, body part.
        </p>
        <Button onClick={handleSetsCSV} disabled={isPending} className="w-full">
          {isPending ? "..." : "Download Sets CSV"}
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-1">🩹 Symptoms CSV</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Daily symptom check-ins. One row per area per day with severity, sleep/workout
          flags, and notes.
        </p>
        <Button onClick={handleSymptomsCSV} disabled={isPending} variant="outline" className="w-full">
          {isPending ? "..." : "Download Symptoms CSV"}
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-1">💾 Full backup (JSON)</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Complete dump of every table: exercises, workouts, sets, templates, routines,
          symptom check-ins, exercise notes. Use to migrate, archive, or re-import.
        </p>
        <Button onClick={handleFullJSON} disabled={isPending} variant="outline" className="w-full">
          {isPending ? "..." : "Download Full Backup"}
        </Button>
      </Card>

      {status && (
        <p className="text-sm text-center text-muted-foreground pt-2">{status}</p>
      )}

      <div className="pt-4 text-xs text-muted-foreground/70 space-y-1">
        <p>
          <strong>Backup strategy:</strong> Download the full JSON once a month and stash it in
          iCloud/Dropbox/Drive. It&rsquo;s small (under a few MB even with years of data).
        </p>
        <p>
          <strong>Re-import:</strong> Not built in yet — but the JSON is structured for easy
          re-insertion via the Supabase client if you ever need it.
        </p>
      </div>
    </div>
  );
}
