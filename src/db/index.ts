import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the SECRET (service-role) key. Bypasses
// Row Level Security — all DB access must happen in server actions / API
// routes only, never client components. Anyone reaching this code path is
// running on Vercel's server, not the user's browser.
//
// Lazy-initialized to survive Vercel's build-time "collect page data" pass
// which loads modules without env vars set on first eval.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SUPABASE_SECRET_KEY is the new naming (sb_secret_…); SUPABASE_SERVICE_ROLE_KEY
  // is the legacy JWT name. Accept either so rotation is painless.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL=${!!url}, SUPABASE_SECRET_KEY=${!!key}`
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Proxy preserves the `supabase` import in actions: every method call resolves
// through getClient(), but module evaluation does nothing until first use.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getClient() as any)[prop];
  },
});
