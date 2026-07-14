import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Supabase is optional: without env vars the app runs on localStorage
   exactly as in Phase 0. Everything checks isSupabaseConfigured() first. */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = (): boolean => Boolean(url && anonKey);

let browserClient: SupabaseClient | null = null;

/** Shared browser client (anon key; auth session persisted in localStorage). */
export function supabase(): SupabaseClient {
  if (!url || !anonKey) throw new Error("Supabase is not configured");
  if (!browserClient) browserClient = createClient(url, anonKey);
  return browserClient;
}
