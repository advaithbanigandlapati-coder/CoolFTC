/**
 * POST /api/rag
 * Trigger re-indexing of all scouting entries for an event.
 * Called from Settings page or automatically after scouting entries are saved.
 *
 * Accepts cookie-based SSR auth (web) or Authorization: Bearer token (mobile).
 * Requires: OPENAI_API_KEY env var for embeddings
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { indexScoutingEntries } from "@coolfTC/aria/rag";

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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "OPENAI_API_KEY not set. RAG requires OpenAI embeddings (text-embedding-3-small). Add it to your .env.local.",
    }, { status: 503 });
  }

  const { orgId, eventKey } = await req.json();
  if (!orgId || !eventKey) return NextResponse.json({ error: "orgId and eventKey required" }, { status: 400 });

  try {
    const count = await indexScoutingEntries(orgId, eventKey);
    return NextResponse.json({ indexed: count, message: `Indexed ${count} scouting entries for RAG.` });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
