/**
 * CoolFTC — ARIA API route v2
 * apps/web/app/api/aria/route.ts
 *
 * What's new vs v1:
 *  • BYOK — resolves Anthropic key per-org (trial → own_key → locked)
 *  • Extended thinking — Claude reasons before answering (budget: 8k tokens)
 *  • Tool use — ARIA can fetch live standings, team profiles, run simulations
 *  • Conversation memory — persists messages + auto-summarizes long threads
 *  • Agentic loop — handles multi-turn tool calls transparently
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { assembleContext } from "@coolfTC/aria";
import { checkRateLimit, recordUsage, LIMITS } from "@coolfTC/aria/rateLimiter";
import { retrieveContext, formatRetrievedContext } from "@coolfTC/aria/rag";
import { ARIA_TOOLS, executeTool } from "@coolfTC/aria/tools";
import { loadConversation, saveConversation, buildMessagesWithHistory } from "@coolfTC/aria/memory";
import { systemBase } from "@coolfTC/aria/prompts/systemBase";
import { decryptApiKey } from "@coolfTC/aria/byokCrypto";
import type { ARIAContext } from "@coolfTC/types";

// ── Key resolution ─────────────────────────────────────────────────────────

async function resolveApiKey(orgId: string): Promise<
  | { key: string; mode: "trial" | "own_key" }
  | { locked: true; reason: string }
> {
  const db = createAdminClient();

  const { data: org } = await db
    .from("organizations")
    .select("api_mode, anthropic_key_enc, trial_tokens_used, trial_expires_at")
    .eq("id", orgId)
    .single();

  if (!org) return { locked: true, reason: "org_not_found" };

  if (org.api_mode === "own_key" && org.anthropic_key_enc) {
    // AES-256-GCM decrypt — encrypted on write via byokCrypto.encryptApiKey
    const key = decryptApiKey(org.anthropic_key_enc);
    if (!key) return { locked: true, reason: "key_decrypt_failed" };
    return { key, mode: "own_key" };
  }

  if (org.api_mode === "trial") {
    const TRIAL_LIMIT = 100_000;
    const expired = org.trial_expires_at && new Date(org.trial_expires_at) < new Date();
    const overLimit = (org.trial_tokens_used ?? 0) >= TRIAL_LIMIT;

    if (expired || overLimit) {
      await db
        .from("organizations")
        .update({ api_mode: "locked", trial_locked_at: new Date().toISOString() })
        .eq("id", orgId);
      return { locked: true, reason: expired ? "trial_expired" : "trial_limit_reached" };
    }

    const teamKey = process.env.ANTHROPIC_API_KEY;
    if (!teamKey) return { locked: true, reason: "no_team_key_configured" };
    return { key: teamKey, mode: "trial" };
  }

  return { locked: true, reason: "no_key_configured" };
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Try Bearer token first (mobile), then cookie-based SSR (web)
  let user = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const res = await sb.auth.getUser(token);
      user = res.data.user;
    }
  }
  if (!user) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const res = await supabase.auth.getUser();
    user = res.data.user;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { messages, activeModules, eventKey, orgId, conversationId = null } = body;

  // ── 1. Resolve API key ────────────────────────────────────────────────────
  const keyResult = await resolveApiKey(orgId);

  if ("locked" in keyResult) {
    return NextResponse.json({
      error: "api_key_required",
      reason: keyResult.reason,
      action: "go_to_settings",
    }, { status: 402 });
  }

  const anthropic = new Anthropic({ apiKey: keyResult.key });

  // ── 2. Rate limit check ───────────────────────────────────────────────────
  const limitCheck = await checkRateLimit(orgId, user.id);
  if (!limitCheck.allowed) {
    return NextResponse.json({
      error: "rate_limited",
      message: limitCheck.reason,
      orgRemaining: limitCheck.orgRemaining,
      userRemaining: limitCheck.userRemaining,
      windowResetsAt: limitCheck.windowResetsAt,
    }, { status: 429 });
  }

  // ── 3. Load conversation history ──────────────────────────────────────────
  const db = createAdminClient();
  const existingConversation = await loadConversation(conversationId, user.id, orgId, eventKey);
  const fullMessages = buildMessagesWithHistory(messages, existingConversation);

  // ── 4. Build system prompt (RAG + context assembly) ───────────────────────
  const userQuery = messages[messages.length - 1]?.content ?? "";
  let systemPrompt = systemBase;
  let ragUsed = false;

  const { count: embeddingCount } = await db
    .from("scouting_embeddings")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("event_key", eventKey);

  if (embeddingCount && embeddingCount > 0 && process.env.OPENAI_API_KEY) {
    try {
      const ragCtx = await retrieveContext(userQuery, orgId, eventKey, {
        scoutingK: 8,
        matchK: 6,
        threshold: 0.25,
      });
      const ragBlock = formatRetrievedContext(ragCtx);

      const { data: teamStats } = await db
        .from("team_stats_cache")
        .select("*")
        .eq("event_key", eventKey)
        .in("team_number", ragCtx.teamNumbers.length > 0 ? ragCtx.teamNumbers : ["__none__"]);

      const { data: lastSim } = await db
        .from("forge_simulations")
        .select("*")
        .eq("org_id", orgId)
        .eq("event_key", eventKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const { data: activeBoard } = await db
        .from("alliance_boards")
        .select("*")
        .eq("org_id", orgId)
        .eq("event_key", eventKey)
        .eq("is_active", true)
        .single();

      const nonScoutModules = activeModules.filter((m: string) => m !== "scout");
      const ctx: ARIAContext = {
        scoutingEntries: [],
        teamStats: (teamStats ?? []) as unknown as ARIAContext["teamStats"],
        lastSimulation: lastSim ?? null,
        activeBoard: activeBoard ?? null,
      };
      const { systemPrompt: basePrompt } = assembleContext(nonScoutModules, ctx);

      systemPrompt = `${basePrompt}\n\n---\n\n${ragBlock}\n\n_Scouting data retrieved via semantic search. You also have tools to fetch live data if needed._`;
      ragUsed = true;
    } catch {
      // Fall through to full context
    }
  }

  if (!ragUsed) {
    const [{ data: scoutingEntries }, { data: teamStats }, { data: lastSim }, { data: activeBoard }] = await Promise.all([
      db.from("scouting_entries").select("*, ftc_teams(team_name)").eq("org_id", orgId).eq("event_key", eventKey),
      db.from("team_stats_cache").select("*").eq("event_key", eventKey),
      db.from("forge_simulations").select("*").eq("org_id", orgId).eq("event_key", eventKey).order("created_at", { ascending: false }).limit(1).single(),
      db.from("alliance_boards").select("*").eq("org_id", orgId).eq("event_key", eventKey).eq("is_active", true).single(),
    ]);
    const ctx: ARIAContext = {
      scoutingEntries: (scoutingEntries ?? []) as unknown as ARIAContext["scoutingEntries"],
      teamStats: (teamStats ?? []) as unknown as ARIAContext["teamStats"],
      lastSimulation: lastSim ?? null,
      activeBoard: activeBoard ?? null,
    };
    const assembled = assembleContext(activeModules, ctx);
    systemPrompt = assembled.systemPrompt;
  }

  systemPrompt += `\n\nYou have tools available to fetch live event data, team profiles, and run simulations. Use them proactively when needed.`;

  // Trim if over budget
  const maxChars = LIMITS.MAX_INPUT_TOKENS * 4;
  if (systemPrompt.length > maxChars) systemPrompt = systemPrompt.slice(0, maxChars) + "\n[Context truncated]";

  // ── 5. Agentic loop with streaming ───────────────────────────────────────
  const encoder = new TextEncoder();
  let inputTokens = 0;
  let outputTokens = 0;
  const assistantMessage: string[] = [];

  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Convert messages for Anthropic API
        const apiMessages: Anthropic.MessageParam[] = fullMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Agentic loop: run until no more tool calls
        let continueLoop = true;
        let loopMessages = [...apiMessages];

        while (continueLoop) {
          const stream = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 16000,
            thinking: { type: "enabled", budget_tokens: 8000 },
            system: systemPrompt,
            messages: loopMessages,
            tools: ARIA_TOOLS,
            tool_choice: { type: "auto" },
            stream: true,
          });

          const toolCalls: { id: string; name: string; input: string }[] = [];
          let currentToolId = "";
          let currentToolName = "";
          let currentToolInput = "";
          let hasToolUse = false;
          const currentAssistantBlocks: Anthropic.ContentBlock[] = [];

          for await (const event of stream) {
            if (event.type === "message_start") {
              inputTokens += event.message.usage?.input_tokens ?? 0;
            }
            if (event.type === "message_delta") {
              outputTokens += event.usage?.output_tokens ?? outputTokens;
            }
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                hasToolUse = true;
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = "";
                // Notify client a tool is being used
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tool_call: currentToolName })}\n\n`));
              }
            }
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                const text = event.delta.text;
                assistantMessage.push(text);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
              if (event.delta.type === "input_json_delta") {
                currentToolInput += event.delta.partial_json;
              }
            }
            if (event.type === "content_block_stop" && hasToolUse && currentToolId) {
              toolCalls.push({ id: currentToolId, name: currentToolName, input: currentToolInput });
              currentToolId = "";
              currentToolName = "";
              currentToolInput = "";
            }
          }

          if (toolCalls.length > 0) {
            // Execute all tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const tc of toolCalls) {
              let parsedInput: Record<string, unknown> = {};
              try { parsedInput = JSON.parse(tc.input || "{}"); } catch {}

              const result = await executeTool(tc.name, parsedInput);
              toolResults.push({ type: "tool_result", tool_use_id: tc.id, content: result });
            }

            // Add assistant turn + tool results for next iteration
            loopMessages = [
              ...loopMessages,
              { role: "assistant", content: currentAssistantBlocks.length > 0 ? currentAssistantBlocks : assistantMessage.join("") },
              { role: "user", content: toolResults },
            ];
          } else {
            continueLoop = false;
          }
        }

        // ── Send completion frame ──────────────────────────────────────────
        const finalAssistant = assistantMessage.join("");

        // Save conversation
        const newConversationId = await saveConversation({
          conversationId,
          userId: user.id,
          orgId,
          eventKey,
          messages: [
            ...(existingConversation?.messages ?? []),
            ...messages,
            { role: "assistant", content: finalAssistant },
          ],
          anthropicKey: keyResult.key,
        });

        // Update trial token usage
        if (keyResult.mode === "trial") {
          await db
            .from("organizations")
            .update({ trial_tokens_used: db.rpc("greatest", { a: 0, b: inputTokens + outputTokens }) })
            .eq("id", orgId);
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          conversation_id: newConversationId,
          usage: { inputTokens, outputTokens },
          mode: keyResult.mode,
          ragUsed,
          rateLimit: {
            orgRemaining: limitCheck.orgRemaining - inputTokens - outputTokens,
            userRemaining: limitCheck.userRemaining - inputTokens - outputTokens,
          },
        })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        await recordUsage({ orgId, userId: user.id, inputTokens, outputTokens, requestType: "aria_chat" });

      } catch (err) {
        const msg = err instanceof Error ? err.message : "ARIA error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-RAG-Used": ragUsed ? "1" : "0",
    },
  });
}
