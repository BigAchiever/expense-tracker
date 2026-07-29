import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 *
 * The service role bypasses RLS, so this must never reach the browser — hence
 * `server-only`, and hence every table having RLS enabled with no policies.
 */
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Project Settings → API).",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: UnusedWebSocket as never },
  });
  return cached;
}

/**
 * This app never opens a Realtime subscription, but supabase-js still asks for
 * a WebSocket implementation when the client is constructed — and Node 20 has
 * none natively, so it throws. Handing it a placeholder that is never
 * instantiated avoids pulling in `ws` just to satisfy a code path we don't use.
 */
class UnusedWebSocket {
  constructor() {
    throw new Error("Realtime subscriptions are not used by this app.");
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
