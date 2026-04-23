/**
 * CoolFTC — Supabase client
 * packages/db/src/client.ts
 *
 * Exports a typed singleton. Import { supabase } everywhere.
 * For server-side admin operations, import { adminSupabase }.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars — check .env.local");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

// Server-side admin client (Next.js API routes / server components only)
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}
