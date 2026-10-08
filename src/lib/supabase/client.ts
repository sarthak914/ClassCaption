"use client";
import { supabaseBrowser } from "./browser";

/** Browser Supabase client for Realtime (alias kept for the screens). */
export function createClient() {
  return supabaseBrowser();
}
