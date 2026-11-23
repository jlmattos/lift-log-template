import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { generateHealthExport } from "@/actions/export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read-only health-data API for the user's external "health chief of staff".
 *
 * Auth: a shared secret in HEALTH_API_TOKEN (Vercel env var). The caller sends
 * it either as `Authorization: Bearer <token>` or `?token=<token>`. Fails closed
 * if the env var is unset. Returns the full health JSON dump (no secrets —
 * see generateHealthExport).
 *
 * GET /api/health        → JSON dump
 * GET /api/health?token= → same, token in query for fetchers that can't set headers
 */
function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws if lengths differ; guard so we still compare safely.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.HEALTH_API_TOKEN;
  if (!expected) return false; // fail closed — no token configured = no access

  // Prefer the Authorization header; fall back to ?token= query param.
  const auth = req.headers.get("authorization");
  let provided: string | null = null;
  if (auth?.startsWith("Bearer ")) {
    provided = auth.slice("Bearer ".length).trim();
  }
  if (!provided) {
    provided = req.nextUrl.searchParams.get("token");
  }
  if (!provided) return false;

  return constantTimeEqual(provided, expected);
}

export async function GET(req: NextRequest) {
  if (!process.env.HEALTH_API_TOKEN) {
    return NextResponse.json(
      { error: "HEALTH_API_TOKEN not configured on the server." },
      { status: 503 },
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid token via Authorization: Bearer header or ?token= query param." },
      { status: 401 },
    );
  }

  // Optional incremental filter: ?since=<ISO 8601 timestamp> returns only rows
  // newer than the watermark. Omitted = full export.
  const sinceParam = req.nextUrl.searchParams.get("since");
  let since: Date | undefined;
  if (sinceParam !== null) {
    const parsed = new Date(sinceParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: `Invalid 'since' value: "${sinceParam}". Expected an ISO 8601 timestamp, e.g. 2026-06-02T00:00:00Z.` },
        { status: 400 },
      );
    }
    since = parsed;
  }

  try {
    const data = await generateHealthExport(since);
    return NextResponse.json(data, {
      status: 200,
      headers: {
        // Don't let CDNs/proxies cache personal health data.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate health export", detail: message },
      { status: 500 },
    );
  }
}
