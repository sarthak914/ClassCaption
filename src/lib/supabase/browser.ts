"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Set by the root layout at request time, so one Docker image works with any Supabase project. */
declare global {
  interface Window {
    __CC_PUBLIC?: { supabaseUrl?: string; supabaseAnonKey?: string };
  }
}

/** Anon client for the browser: read-only data + Realtime. */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  // Tolerate a trailing slash or /rest/v1 copied from the dashboard; storage calls break with either.
  const runtime = typeof window !== "undefined" ? window.__CC_PUBLIC : undefined;
  const url = (runtime?.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
  const key = runtime?.supabaseAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  client = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
  return client;
}
