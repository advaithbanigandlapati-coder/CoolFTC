/**
 * CoolFTC — BYOK API Route
 * apps/web/app/api/byok/route.ts
 *
 * GET  /api/byok          — get current key status + trial usage
 * POST /api/byok          — save a new Anthropic API key
 * POST /api/byok?test=1   — test a key without saving it
 * DELETE /api/byok        — remove BYOK key (revert to trial if still valid)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";
import { encryptApiKey, decryptApiKey, maskApiKey, isByokConfigured } from "@coolfTC/aria/byokCrypto";

const TRIAL_LIMIT = 100_000;

async function getUser(req: NextRequest) {
  // Try bearer token first (mobile)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) return user;
    }
  }
  // Fall back to SSR cookies (web)
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function requireAdmin(userId: string, orgId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();
  return data?.role === "admin";
}

// GET — key status + trial info
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const db = createAdminClient();
  const { data: org } = await db
    .from("organizations")
    .select("api_mode, anthropic_key_enc, trial_tokens_used, trial_expires_at, trial_started_at, trial_locked_at")
    .eq("id", orgId)
    .single();

  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const tokensUsed = org.trial_tokens_used ?? 0;
  const trialPct = Math.min(100, Math.round((tokensUsed / TRIAL_LIMIT) * 100));
  const daysLeft = org.trial_expires_at
    ? Math.max(0, Math.ceil((new Date(org.trial_expires_at).getTime() - Date.now()) / 86400000))
    : 0;

  return NextResponse.json({
    mode: org.api_mode,
    hasOwnKey: !!org.anthropic_key_enc,
    keyPreview: org.anthropic_key_enc
      ? maskApiKey(decryptApiKey(org.anthropic_key_enc) ?? "")
      : null,
    trial: {
      tokensUsed,
      tokensRemaining: Math.max(0, TRIAL_LIMIT - tokensUsed),
      tokensLimit: TRIAL_LIMIT,
      pct: trialPct,
      daysLeft,
      expiresAt: org.trial_expires_at,
      lockedAt: org.trial_locked_at,
    },
  });
}

// POST — save key or test key
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const isTest = searchParams.get("test") === "1";

  const body = await req.json();
  const { orgId, key } = body as { orgId: string; key: string };

  if (!orgId || !key) return NextResponse.json({ error: "orgId and key required" }, { status: 400 });
  if (!key.startsWith("sk-ant-")) return NextResponse.json({ error: "Invalid key format — must start with sk-ant-" }, { status: 400 });

  // Verify key works with a minimal API call
  try {
    const client = new Anthropic({ apiKey: key });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Key validation failed";
    return NextResponse.json({ error: `Key test failed: ${msg}` }, { status: 400 });
  }

  if (isTest) return NextResponse.json({ valid: true, message: "Key is valid ✓" });

  // Save key — check admin
  const isAdmin = await requireAdmin(user.id, orgId);
  if (!isAdmin) return NextResponse.json({ error: "Only org admins can set API keys" }, { status: 403 });

  if (!isByokConfigured()) {
    return NextResponse.json({
      error: "Server-side BYOK_ENCRYPTION_KEY is not set. Ask your platform admin to configure it.",
    }, { status: 500 });
  }

  const db = createAdminClient();
  const encoded = encryptApiKey(key);

  await db
    .from("organizations")
    .update({
      anthropic_key_enc: encoded,
      api_mode: "own_key",
    })
    .eq("id", orgId);

  return NextResponse.json({ success: true, message: "API key saved. ARIA now uses your key." });
}

// DELETE — remove BYOK key
export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const isAdmin = await requireAdmin(user.id, orgId);
  if (!isAdmin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const db = createAdminClient();
  const { data: org } = await db
    .from("organizations")
    .select("trial_expires_at, trial_tokens_used")
    .eq("id", orgId)
    .single();

  const trialStillValid =
    org &&
    new Date(org.trial_expires_at) > new Date() &&
    (org.trial_tokens_used ?? 0) < TRIAL_LIMIT;

  await db
    .from("organizations")
    .update({
      anthropic_key_enc: null,
      api_mode: trialStillValid ? "trial" : "locked",
    })
    .eq("id", orgId);

  return NextResponse.json({
    success: true,
    message: trialStillValid ? "Key removed. Reverted to trial." : "Key removed. Trial exhausted — add a new key to continue.",
  });
}
