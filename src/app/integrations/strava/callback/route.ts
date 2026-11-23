import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveStravaTokens } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/integrations/strava?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/integrations/strava?error=missing_code`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveStravaTokens(tokens);
    return NextResponse.redirect(`${origin}/integrations/strava?connected=1`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.redirect(`${origin}/integrations/strava?error=${encodeURIComponent(msg)}`);
  }
}
