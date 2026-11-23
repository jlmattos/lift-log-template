// Setup verifier: run after each HANDOFF step to see what is done and what
// is next. Prints a checklist; exits 0 when the required pieces are in place.
//
//   node scripts/check-setup.mjs
//
// Reads .env.local (never prints secret values — only whether they are set).
// Dependency-free so it runs before `npm install` too.

import { readFileSync, existsSync } from "node:fs";

const EXPECTED_TABLES = [
  "equipment", "exercises", "templates", "template_exercises", "workouts", "sets",
  "workout_exercise_skips", "cardio_templates", "cardio_sessions", "strava_tokens",
  "routines", "routine_days", "routine_skips", "bodyweight_logs", "injury_areas",
  "symptom_checkins", "lift_goals", "benchmark_lifts", "exercise_notes",
  "user_profile", "user_context", "chat_conversations", "chat_messages",
];

const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`  ·  ${m}`);
let failures = 0;

// ── 1. Node ────────────────────────────────────────────────────────────────
console.log("\nNode");
const major = parseInt(process.versions.node.split(".")[0], 10);
if (major >= 20) ok(`Node ${process.versions.node}`);
else { no(`Node ${process.versions.node} — need 20 or newer (https://nodejs.org)`); failures++; }
if (existsSync("node_modules")) ok("dependencies installed");
else { no("dependencies not installed — run: npm install"); failures++; }

// ── 2. .env.local ──────────────────────────────────────────────────────────
console.log("\n.env.local");
const env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  ok(".env.local exists");
} else {
  no(".env.local missing — run: cp .env.example .env.local, then fill in the two Supabase values");
  failures++;
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (url && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) ok("NEXT_PUBLIC_SUPABASE_URL looks right");
else { no("NEXT_PUBLIC_SUPABASE_URL missing or not a https://….supabase.co URL"); failures++; }
if (key && key.length > 20) ok(`SUPABASE_SECRET_KEY set (${key.startsWith("sb_secret_") ? "new-style secret key" : "legacy service-role JWT"})`);
else { no("SUPABASE_SECRET_KEY missing — Supabase → Project Settings → API Keys → secret key"); failures++; }

const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (env.HOME_TZ) {
  try { Intl.DateTimeFormat("en-US", { timeZone: env.HOME_TZ }); ok(`HOME_TZ=${env.HOME_TZ}${env.HOME_TZ !== sysTz ? ` (this computer is ${sysTz})` : ""}`); }
  catch { no(`HOME_TZ=${env.HOME_TZ} is not a valid IANA timezone (this computer reports ${sysTz})`); failures++; }
} else { no(`HOME_TZ not set — this computer's timezone is ${sysTz}; add HOME_TZ=${sysTz}`); failures++; }

for (const [name, what] of [
  ["ANTHROPIC_API_KEY", "AI advisor (Chat)"],
  ["HEALTH_API_TOKEN", "/api/health export endpoint"],
  ["MCP_SECRET", "MCP endpoint"],
  ["INTERVALS_API_KEY", "intervals.icu cardio sync"],
  ["STRAVA_CLIENT_ID", "Strava cardio sync"],
]) info(`${env[name] ? "set    " : "not set"}  ${name} — optional, ${what}`);

// ── 3. Database ────────────────────────────────────────────────────────────
console.log("\nDatabase");
if (url && key) {
  const base = url.replace(/\/$/, "");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Range: "0-0" };
  const missing = [];
  let reachable = true;
  for (const t of EXPECTED_TABLES) {
    try {
      const r = await fetch(`${base}/rest/v1/${t}?select=id`, { headers });
      if (r.status === 404) missing.push(t);
      else if (r.status === 401 || r.status === 403) { no(`credentials rejected (${r.status}) — check SUPABASE_SECRET_KEY`); failures++; reachable = false; break; }
      else if (!r.ok) { no(`${t}: HTTP ${r.status}`); failures++; }
    } catch (e) {
      no(`cannot reach ${base} (${e.message}) — check the URL / your network`); failures++; reachable = false; break;
    }
  }
  if (reachable) {
    if (missing.length === 0) ok(`all ${EXPECTED_TABLES.length} tables present`);
    else if (missing.length === EXPECTED_TABLES.length) { no("no tables yet — paste supabase/schema.sql into the Supabase SQL editor and run it"); failures++; }
    else { no(`${missing.length} tables missing: ${missing.join(", ")} — re-run supabase/schema.sql (it is safe to re-run)`); failures++; }
    if (missing.length === 0) {
      const r = await fetch(`${base}/rest/v1/exercises?select=id`, { headers });
      const n = parseInt((r.headers.get("content-range") || "/0").split("/")[1], 10) || 0;
      info(n === 0 ? "no exercises yet — add some under More → Exercises once the app runs" : `${n} exercises`);
    }
  }
} else info("skipped (fix .env.local first)");

console.log(failures === 0
  ? "\n🎉 Local setup complete. Next: `npm run dev`, then deploy to Vercel (HANDOFF.md §3).\n"
  : `\n${failures} thing${failures === 1 ? "" : "s"} to fix above, then run this again.\n`);
process.exit(failures === 0 ? 0 : 1);
