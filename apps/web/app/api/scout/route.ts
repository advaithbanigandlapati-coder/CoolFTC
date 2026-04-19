/**
 * POST /api/scout
 * Save a match scouting entry and automatically trigger RAG indexing.
 * This keeps the vector index fresh without manual re-indexing.
 *
 * Accepts cookie-based SSR auth (web) or Authorization: Bearer token (mobile).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { indexMatchEntry } from "@coolfTC/aria/rag";
import type { MatchScoutingEntry } from "@coolfTC/types";

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) return user;
    }
  }
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const db = createAdminClient();

  const { data, error } = await db
    .from("match_scouting")
    .upsert({ ...body, scouted_by: user.id, scouted_at: new Date().toISOString() }, { onConflict: "org_id,event_key,match_number,team_number" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-index in background (don't block the response)
  if (process.env.OPENAI_API_KEY) {
    indexMatchEntry(data as MatchScoutingEntry, body.org_id, body.event_key).catch(console.warn);
  }

  return NextResponse.json({ success: true, id: data.id });
}
