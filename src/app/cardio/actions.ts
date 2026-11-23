"use server";

import { redirect } from "next/navigation";
import { syncCardioSources } from "@/actions/cardio";

export async function syncCardioAction() {
  const result = await syncCardioSources();
  if (!result.ok) {
    redirect(`/cardio?error=${encodeURIComponent(result.message ?? "unknown")}`);
  }
  redirect("/cardio?synced=1");
}
