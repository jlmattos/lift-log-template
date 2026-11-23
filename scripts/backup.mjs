// Dump every lift-log table to JSON. Dependency-free (plain fetch), so it
// runs locally AND in GitHub Actions without installing anything.
//
//   node scripts/backup.mjs            → backups/lift-log-backup-YYYY-MM-DD.json
//   node scripts/backup.mjs --latest   → backups/latest.json (CI commits this;
//                                        git history = nightly snapshots forever)
//
// Credentials: SUPABASE_URL + SUPABASE_SECRET_KEY env vars (CI), falling back
// to .env.local (local runs). strava_tokens is deliberately EXCLUDED — OAuth
// credentials never belong in a git repo.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

function fromEnvLocal(name) {
  if (!existsSync(".env.local")) return null;
  const m = readFileSync(".env.local", "utf-8").match(new RegExp(`${name}=(.+)`));
  return m ? m[1].trim() : null;
}

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? fromEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_SECRET_KEY ?? fromEnvLocal("SUPABASE_SECRET_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY (env or .env.local)");
  process.exit(1);
}

// Every live table except strava_tokens (secrets). A missing table (renamed /
// not yet migrated) logs a warning instead of failing the whole backup.
const TABLES = [
  "equipment",
  "exercises",
  "exercise_notes",
  "templates",
  "template_exercises",
  "routines",
  "routine_days",
  "routine_skips",
  "workouts",
  "workout_exercise_skips",
  "sets",
  "cardio_sessions",
  "cardio_templates",
  "lift_goals",
  "benchmark_lifts",
  "bodyweight_logs",
  "injury_areas",
  "symptom_checkins",
  "user_profile",
  "user_context",
  "chat_conversations",
  "chat_messages",
];

const PAGE = 1000;
async function dumpTable(table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${offset}-${offset + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const dump = { app: "lift-log", exportedAt: new Date().toISOString() };
let ok = 0, failed = 0;
for (const t of TABLES) {
  try {
    dump[t] = await dumpTable(t);
    ok++;
    console.log(`  ${t}: ${dump[t].length} rows`);
  } catch (e) {
    failed++;
    console.warn(`  ! ${t}: skipped (${e.message.slice(0, 80)})`);
  }
}

// A missing table here or there is tolerable; widespread failure means the
// credentials are wrong — fail LOUDLY instead of committing an empty backup.
if (ok === 0 || failed > ok) {
  console.error(`\n✗ Backup failed: ${ok} tables dumped, ${failed} failed. Check SUPABASE_URL / SUPABASE_SECRET_KEY.`);
  process.exit(1);
}

mkdirSync("backups", { recursive: true });
const file = process.argv.includes("--latest")
  ? "backups/latest.json"
  : `backups/lift-log-backup-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`\n✓ ${file}`);
