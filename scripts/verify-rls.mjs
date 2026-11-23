// One-shot RLS verification. Reads creds from .env.local.
// Checks:
//   1. service-role / secret key  -> read SUCCEEDS (RLS bypassed)
//   2. anon/publishable key       -> read returns 0 rows (RLS blocks)
//   3. production app pages        -> still return 200
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const anon =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.OLD_ANON_KEY ||
  null;

console.log("Supabase URL:", url ? "set" : "MISSING");
console.log("Secret key:", secret ? "set" : "MISSING");
console.log("Anon key available for test:", anon ? "yes" : "no (will test unauthenticated instead)");
console.log("");

const TABLE = "exercises"; // a table that has rows

async function restRead(key, label) {
  try {
    const res = await fetch(`${url}/rest/v1/${TABLE}?select=id&limit=1`, {
      headers: key
        ? { apikey: key, Authorization: `Bearer ${key}` }
        : {},
    });
    const status = res.status;
    let body;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const rows = Array.isArray(body) ? body.length : null;
    console.log(`[${label}] HTTP ${status}  rows=${rows}  body=${JSON.stringify(body).slice(0, 160)}`);
    return { status, rows, body };
  } catch (e) {
    console.log(`[${label}] ERROR ${e.message}`);
    return { error: e.message };
  }
}

// 1. service key -> should succeed with >=1 row
const svc = await restRead(secret, "SECRET key");

// 2. anon key (or unauthenticated) -> should be blocked (0 rows or 401)
let anonResult;
if (anon) {
  anonResult = await restRead(anon, "ANON key");
} else {
  anonResult = await restRead(null, "NO key (unauth)");
}

console.log("\n=== VERDICT ===");
const svcOk = svc.rows >= 1;
console.log(svcOk ? "✓ Secret key CAN read (RLS bypassed as expected)" : "✗ Secret key read FAILED — investigate");

if (anon) {
  const blocked = anonResult.rows === 0 || anonResult.status === 401 || anonResult.status === 403;
  console.log(
    blocked
      ? "✓ Anon key BLOCKED by RLS (0 rows / denied)"
      : `✗ Anon key STILL READS ${anonResult.rows} rows — RLS NOT effective!`
  );
} else {
  console.log("• No anon key on file to test client exposure (it was removed — good).");
}

// 3. app health
const appBase = process.env.APP_URL || env.NEXT_PUBLIC_APP_URL || null;
if (appBase) {
  for (const path of ["/", "/strength"]) {
    try {
      const r = await fetch(appBase + path, { redirect: "manual" });
      console.log(`[app] ${path} -> HTTP ${r.status}`);
    } catch (e) {
      console.log(`[app] ${path} -> ERROR ${e.message}`);
    }
  }
} else {
  console.log("• Set APP_URL=... to also check production pages.");
}
