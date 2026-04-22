/**
 * CoolFTC — RAG (Retrieval-Augmented Generation) engine
 * packages/aria/src/rag.ts
 *
 * WHY RAG INSTEAD OF DUMPING EVERYTHING INTO CONTEXT:
 * ─────────────────────────────────────────────────────
 * The naive approach: serialize all 60 scouting entries → paste into system prompt.
 * Problems: (a) expensive — 60 teams × ~200 tokens each = 12k tokens per call,
 *           (b) noisy — Claude has to filter out irrelevant teams itself,
 *           (c) doesn't scale past ~30 teams before hitting rate limits.
 *
 * The RAG approach: embed each scouting entry as a vector, embed the user's
 * query, then retrieve ONLY the top-k most semantically similar teams.
 * Result: 8-12 highly relevant entries instead of 60 noisy ones.
 * Token cost: ~400-800 tokens of context instead of 12k.
 * Quality: better answers because Claude gets focused, relevant data.
 *
 * FLOW:
 * 1. When a scouting entry is saved → embed its text representation → store in pgvector
 * 2. When ARIA is called → embed the user query → similarity search → retrieve top-k
 * 3. Assemble those k entries as ARIA context instead of all entries
 */

import OpenAI from "openai"; // Anthropic doesn't have embeddings; use OpenAI text-embedding-3-small
import { createAdminClient } from "@coolfTC/db";
import type { ScoutingEntry, MatchScoutingEntry } from "@coolfTC/types";

// Note: add OPENAI_API_KEY to .env.local — only used for embeddings, not chat
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY not set — required for RAG embeddings");
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

// ──────────────────────────────────────────────────────────────────────
// TEXT SERIALIZATION
// Convert a scouting entry into a dense text representation for embedding
// ──────────────────────────────────────────────────────────────────────

export function serializeScoutingEntry(entry: ScoutingEntry & { ftc_teams?: { team_name: string | null } }): string {
  const fd = entry.form_data as unknown as Record<string, unknown>;
  const lines = [
    `Team ${entry.team_number} ${entry.ftc_teams?.team_name ? `(${entry.ftc_teams.team_name})` : ""}`,
    `Tier: ${entry.tier ?? "unranked"} | Alliance target: ${entry.alliance_target ? "YES" : "no"} | DNP: ${entry.dnp ? `YES - ${entry.dnp_reason ?? "no reason"}` : "no"}`,
    fd.hasAuto || fd.autoCloseRange || fd.autoFarRange
      ? `Auto: capable, close range: ${fd.autoCloseRange ?? "unknown"}, far range: ${fd.autoFarRange ?? "unknown"}, avg balls: ${fd.avgBallsAuto ?? "?"}` 
      : "Auto: no auto capability observed",
    `Teleop: avg balls ${fd.avgBallsTeleop ?? "?"}, high ${fd.highBallsTeleop ?? "?"}`,
    `Endgame plan: ${fd.endgamePlan ?? "none"}`,
    entry.ai_analysis?.notes ? `Scout notes: ${entry.ai_analysis.notes}` : "",
    fd.generalNotes ? `General notes: ${fd.generalNotes}` : "",
  ].filter(Boolean);
  return lines.join(". ");
}

export function serializeMatchEntry(entry: MatchScoutingEntry): string {
  const fd = entry.form_data as unknown as Record<string, unknown>;
  return [
    `Team ${entry.team_number} in qual match ${entry.match_number} on ${entry.alliance} alliance`,
    `Scores: auto ${entry.auto_score}, teleop ${entry.teleop_score}, endgame ${entry.endgame_score}, total ${entry.total_score}`,
    fd.autoLeave ? "auto leave: yes" : "auto leave: no",
    fd.endgamePlan ? `endgame: ${fd.endgamePlan}` : "",
    fd.generalNotes ? `notes: ${fd.generalNotes}` : "",
  ].filter(Boolean).join(". ");
}

// ──────────────────────────────────────────────────────────────────────
// EMBEDDING
// ──────────────────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
    encoding_format: "float",
  });
  return res.data.map((d) => d.embedding);
}

// ──────────────────────────────────────────────────────────────────────
// INDEX — embed and store all scouting entries for an event
// Called when: entries are created/updated, or via admin "rebuild index" button
// ──────────────────────────────────────────────────────────────────────

export async function indexScoutingEntries(orgId: string, eventKey: string): Promise<number> {
  const db = createAdminClient();

  // Fetch all scouting entries with team info
  const { data: entries, error } = await db
    .from("scouting_entries")
    .select("*, ftc_teams(team_name)")
    .eq("org_id", orgId)
    .eq("event_key", eventKey);

  if (error || !entries?.length) return 0;

  // Serialize all to text
  const texts = (entries as (ScoutingEntry & { ftc_teams: { team_name: string | null } })[]).map(serializeScoutingEntry);

  // Embed in batch (more efficient — one API call for all)
  const embeddings = await embedBatch(texts);

  // Upsert into scouting_embeddings
  const rows = entries.map((entry, i) => ({
    scouting_entry_id: entry.id,
    org_id: orgId,
    event_key: eventKey,
    team_number: entry.team_number,
    embedded_text: texts[i],
    embedding: JSON.stringify(embeddings[i]), // pgvector accepts JSON array
    updated_at: new Date().toISOString(),
  }));

  await db.from("scouting_embeddings").upsert(rows, { onConflict: "scouting_entry_id" });
  return rows.length;
}

export async function indexMatchEntry(
  matchEntry: MatchScoutingEntry,
  orgId: string,
  eventKey: string
): Promise<void> {
  const db = createAdminClient();
  const text = serializeMatchEntry(matchEntry);
  const embedding = await embedText(text);

  await db.from("match_embeddings").upsert({
    match_scouting_id: matchEntry.id,
    org_id: orgId,
    event_key: eventKey,
    team_number: matchEntry.team_number,
    embedded_text: text,
    embedding: JSON.stringify(embedding),
  }, { onConflict: "match_scouting_id" });
}

// ──────────────────────────────────────────────────────────────────────
// RETRIEVAL — the core RAG step
// Given a user query, find the most relevant scouting entries
// ──────────────────────────────────────────────────────────────────────

export interface RetrievedContext {
  scoutingEntries: { team_number: string; text: string; similarity: number }[];
  matchEntries:    { team_number: string; text: string; similarity: number }[];
  teamNumbers:     string[]; // unique teams found (for stats lookup)
  totalTokenEstimate: number;
}

export async function retrieveContext(
  query: string,
  orgId: string,
  eventKey: string,
  opts: {
    scoutingK?: number;  // max scouting entries to retrieve (default 8)
    matchK?: number;     // max match entries (default 6)
    threshold?: number;  // similarity threshold (default 0.25)
  } = {}
): Promise<RetrievedContext> {
  const { scoutingK = 8, matchK = 6, threshold = 0.25 } = opts;
  const db = createAdminClient();

  // Embed the query
  const queryEmbedding = await embedText(query);
  const embeddingStr = JSON.stringify(queryEmbedding);

  // Parallel similarity searches
  const [scoutRes, matchRes] = await Promise.all([
    db.rpc("match_scouting_entries", {
      query_embedding: embeddingStr,
      p_org_id: orgId,
      p_event_key: eventKey,
      match_count: scoutingK,
      similarity_threshold: threshold,
    }),
    db.rpc("match_match_entries", {
      query_embedding: embeddingStr,
      p_org_id: orgId,
      p_event_key: eventKey,
      match_count: matchK,
      similarity_threshold: threshold,
    }),
  ]);

  const scoutingEntries = (scoutRes.data ?? []).map((r: Record<string, unknown>) => ({
    team_number: r.team_number as string,
    text: r.embedded_text as string,
    similarity: r.similarity as number,
  }));

  const matchEntries = (matchRes.data ?? []).map((r: Record<string, unknown>) => ({
    team_number: r.team_number as string,
    text: r.embedded_text as string,
    similarity: r.similarity as number,
  }));

  const teamNumbers = [...new Set([
    ...scoutingEntries.map((e: { team_number: string }) => e.team_number),
    ...matchEntries.map((e: { team_number: string }) => e.team_number),
  ])];

  // Rough token estimate: ~1 token per 4 chars
  const totalText = [...scoutingEntries, ...matchEntries].map((e) => e.text).join(" ");
  const totalTokenEstimate = Math.ceil(totalText.length / 4);

  return { scoutingEntries, matchEntries, teamNumbers, totalTokenEstimate };
}

// ──────────────────────────────────────────────────────────────────────
// FORMAT retrieved context as a string block for the system prompt
// ──────────────────────────────────────────────────────────────────────

export function formatRetrievedContext(ctx: RetrievedContext): string {
  if (ctx.scoutingEntries.length === 0 && ctx.matchEntries.length === 0) {
    return "## RETRIEVED CONTEXT\nNo relevant scouting data found for this query. The event may not have any scouted entries yet.";
  }

  const lines: string[] = ["## RETRIEVED SCOUTING DATA (semantic search — most relevant teams for your query)"];

  if (ctx.scoutingEntries.length > 0) {
    lines.push(`
### Team Profiles (${ctx.scoutingEntries.length} retrieved, sorted by relevance)`);
    for (const e of ctx.scoutingEntries) {
      lines.push(`  [${(e.similarity * 100).toFixed(0)}% match] ${e.text}`);
    }
  }

  if (ctx.matchEntries.length > 0) {
    lines.push(`
### Match Performance (${ctx.matchEntries.length} retrieved)`);
    for (const e of ctx.matchEntries) {
      lines.push(`  [${(e.similarity * 100).toFixed(0)}% match] ${e.text}`);
    }
  }

  lines.push(`
_Context retrieved via semantic search. ${ctx.teamNumbers.length} unique teams referenced._`);
  return lines.join("\n");
}
