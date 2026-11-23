"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { disconnectStrava } from "@/lib/strava";

export async function disconnectStravaAction() {
  await disconnectStrava();
  revalidatePath("/integrations/strava");
  redirect("/integrations/strava");
}
