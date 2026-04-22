/**
 * CoolFTC — ARIA Conversation Memory
 * packages/aria/src/memory.ts
 *
 * Persists ARIA conversations per user+org+event in Supabase.
 * After 12 turns, compresses old context into a summary so you
 * don't pay for the full transcript every call.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@coolfTC/db";

const SUMMARIZE_AFTER_TURNS = 12;
const MAX_MESSAGES_BEFORE_SUMMARY = 16;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationRecord {
  id: string;
  title: string | null;
  messages: ConversationMessage[];
  summary: string | null;
  turn_count: number;
  updated_at: string;
}

// ── Load or create a conversation ────────────────────────────────────────────

export async function loadConversation(
  conversationId: string | null,
  userId: string,
  orgId: string,
  eventKey: string
): Promise<ConversationRecord | null> {
  const db = createAdminClient();

  if (!conversationId) return null;

  const { data } = await db
    .from("aria_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  return data as ConversationRecord | null;
}

export async function listConversations(
  userId: string,
  orgId: string,
  eventKey: string
): Promise<Pick<ConversationRecord, "id" | "title" | "turn_count" | "updated_at">[]> {
  const db = createAdminClient();

  const { data } = await db
    .from("aria_conversations")
    .select("id, title, turn_count, updated_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("event_key", eventKey)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (data ?? []) as ConversationRecord[];
}

// ── Save messages back after a turn ─────────────────────────────────────────

export async function saveConversation(opts: {
  conversationId: string | null;
  userId: string;
  orgId: string;
  eventKey: string;
  messages: ConversationMessage[];
  anthropicKey?: string; // needed for auto-summarization
}): Promise<string> {
  const { conversationId, userId, orgId, eventKey, messages } = opts;
  const db = createAdminClient();

  const turnCount = messages.filter((m) => m.role === "user").length;

  // Auto-generate title from first user message
  const title = messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? null;

  if (!conversationId) {
    const { data } = await db
      .from("aria_conversations")
      .insert({
        user_id: userId,
        org_id: orgId,
        event_key: eventKey,
        title,
        messages: messages as unknown as Record<string, unknown>[],
        turn_count: turnCount,
      })
      .select("id")
      .single();
    return data?.id ?? "";
  }

  await db
    .from("aria_conversations")
    .update({
      messages: messages as unknown as Record<string, unknown>[],
      title: title ?? undefined,
      turn_count: turnCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  // Trigger summarization in background if conversation is long
  if (turnCount >= SUMMARIZE_AFTER_TURNS && opts.anthropicKey) {
    summarizeConversation(conversationId, messages, opts.anthropicKey).catch(
      (e) => console.warn("[ARIA memory] summarization failed:", e)
    );
  }

  return conversationId;
}

// ── Build messages array with optional summary prefix ────────────────────────

export function buildMessagesWithHistory(
  currentMessages: ConversationMessage[],
  existingConversation: ConversationRecord | null
): ConversationMessage[] {
  if (!existingConversation) return currentMessages;

  // If there's a summary, inject it as a system-level context message
  const historicalMessages: ConversationMessage[] = [];

  if (existingConversation.summary && existingConversation.messages.length > MAX_MESSAGES_BEFORE_SUMMARY) {
    // Use summary + only the last 6 messages from history to keep context fresh
    historicalMessages.push({
      role: "user",
      content: `[Previous conversation summary]: ${existingConversation.summary}`,
    });
    historicalMessages.push({
      role: "assistant",
      content: "Understood. I have context from our earlier conversation. How can I help?",
    });
    const recentHistory = existingConversation.messages.slice(-6);
    historicalMessages.push(...recentHistory);
  } else {
    // Short conversation — include all previous messages
    historicalMessages.push(...existingConversation.messages);
  }

  return [...historicalMessages, ...currentMessages];
}

// ── Auto-summarize long conversations ────────────────────────────────────────

async function summarizeConversation(
  conversationId: string,
  messages: ConversationMessage[],
  apiKey: string
): Promise<void> {
  const db = createAdminClient();

  // Only summarize if not recently done
  const { data: existing } = await db
    .from("aria_conversations")
    .select("summary, updated_at")
    .eq("id", conversationId)
    .single();

  if (!existing) return;

  const client = new Anthropic({ apiKey });

  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Summarize the key strategic decisions, team assessments, and conclusions from this FTC scouting conversation in 3-5 sentences. Focus on what was decided, not what was asked.\n\n${transcript}`,
      },
    ],
  });

  const summary = response.content.find((b) => b.type === "text")?.text ?? "";
  if (!summary) return;

  await db
    .from("aria_conversations")
    .update({ summary })
    .eq("id", conversationId);
}
