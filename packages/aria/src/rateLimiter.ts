/**
 * CoolFTC — ARIA Rate Limiter
 * packages/aria/src/rateLimiter.ts
 *
 * 5-hour rolling window limits to prevent token runaway.
 * Three tiers:
 *   - Per-org:  150,000 tokens / 5 hours  (shared across all members)
 *   - Per-user: 30,000 tokens / 5 hours   (individual scout cap)
 *   - Per-req:  1,500 tokens max output   (enforced in the API call itself)
 *
 * Why 5-hour rolling window vs fixed hourly?
 * Competition days run 8-10 hours. A fixed hourly window would exhaust
 * during crunch time (alliance selection). Rolling window smooths usage
 * across the day without hard resets at the top of the hour.
 */

import { createAdminClient } from "@coolfTC/db";

export const LIMITS = {
  ORG_TOKENS_PER_5H:  150_000,   // ~100 average ARIA calls per 5-hour window
  USER_TOKENS_PER_5H:  30_000,   // ~20 average calls per user per 5-hour window
  MAX_OUTPUT_TOKENS:    1_500,   // per-request output cap
  MAX_INPUT_TOKENS:     6_000,   // per-request input cap (context + query)
  WINDOW_HOURS:             5,
} as const;

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  orgUsed: number;
  orgRemaining: number;
  userUsed: number;
  userRemaining: number;
  windowResetsAt: Date;
}

export interface UsageRecord {
  orgId: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
  requestType: string; // e.g. "aria_chat", "aria_alliance_pick"
}

/**
 * Check whether a request should be allowed before making the API call.
 */
export async function checkRateLimit(orgId: string, userId: string): Promise<RateLimitResult> {
  const db = createAdminClient();
  const windowStart = new Date(Date.now() - LIMITS.WINDOW_HOURS * 60 * 60 * 1000);

  // Query org usage and user usage in parallel
  const [orgRes, userRes] = await Promise.all([
    db.from("aria_rate_limits")
      .select("tokens_used")
      .eq("org_id", orgId)
      .gte("window_start", windowStart.toISOString()),
    db.from("aria_rate_limits")
      .select("tokens_used")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .gte("window_start", windowStart.toISOString()),
  ]);

  const orgUsed = (orgRes.data ?? []).reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
  const userUsed = (userRes.data ?? []).reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);

  // Find the oldest record to know when the window resets
  const oldestRes = await db.from("aria_rate_limits")
    .select("window_start")
    .eq("org_id", orgId)
    .gte("window_start", windowStart.toISOString())
    .order("window_start", { ascending: true })
    .limit(1)
    .single();

  const windowResetsAt = oldestRes.data
    ? new Date(new Date(oldestRes.data.window_start).getTime() + LIMITS.WINDOW_HOURS * 60 * 60 * 1000)
    : new Date(Date.now() + LIMITS.WINDOW_HOURS * 60 * 60 * 1000);

  if (orgUsed >= LIMITS.ORG_TOKENS_PER_5H) {
    return {
      allowed: false,
      reason: `Team ARIA limit reached (${orgUsed.toLocaleString()} / ${LIMITS.ORG_TOKENS_PER_5H.toLocaleString()} tokens used in the last ${LIMITS.WINDOW_HOURS}h). Resets at ${windowResetsAt.toLocaleTimeString()}.`,
      orgUsed, orgRemaining: 0, userUsed,
      userRemaining: Math.max(0, LIMITS.USER_TOKENS_PER_5H - userUsed),
      windowResetsAt,
    };
  }

  if (userUsed >= LIMITS.USER_TOKENS_PER_5H) {
    return {
      allowed: false,
      reason: `Your personal ARIA limit reached (${userUsed.toLocaleString()} / ${LIMITS.USER_TOKENS_PER_5H.toLocaleString()} tokens in the last ${LIMITS.WINDOW_HOURS}h). Resets at ${windowResetsAt.toLocaleTimeString()}.`,
      orgUsed, orgRemaining: LIMITS.ORG_TOKENS_PER_5H - orgUsed,
      userUsed, userRemaining: 0,
      windowResetsAt,
    };
  }

  return {
    allowed: true,
    orgUsed,
    orgRemaining: LIMITS.ORG_TOKENS_PER_5H - orgUsed,
    userUsed,
    userRemaining: LIMITS.USER_TOKENS_PER_5H - userUsed,
    windowResetsAt,
  };
}

/**
 * Record actual token usage after a successful ARIA call.
 */
export async function recordUsage(record: UsageRecord): Promise<void> {
  const db = createAdminClient();
  const totalTokens = record.inputTokens + record.outputTokens;

  await db.from("aria_rate_limits").insert({
    org_id: record.orgId,
    user_id: record.userId,
    tokens_used: totalTokens,
    window_start: new Date().toISOString(),
  });
}

/**
 * Get current usage stats for display in the UI.
 */
export async function getUsageStats(orgId: string, userId: string) {
  const db = createAdminClient();
  const windowStart = new Date(Date.now() - LIMITS.WINDOW_HOURS * 60 * 60 * 1000);

  const [orgRes, userRes, requestRes] = await Promise.all([
    db.from("aria_rate_limits").select("tokens_used").eq("org_id", orgId).gte("window_start", windowStart.toISOString()),
    db.from("aria_rate_limits").select("tokens_used").eq("org_id", orgId).eq("user_id", userId).gte("window_start", windowStart.toISOString()),
    db.from("aria_rate_limits").select("id").eq("org_id", orgId).gte("window_start", windowStart.toISOString()),
  ]);

  const orgUsed = (orgRes.data ?? []).reduce((s, r) => s + r.tokens_used, 0);
  const userUsed = (userRes.data ?? []).reduce((s, r) => s + r.tokens_used, 0);
  const requestCount = requestRes.data?.length ?? 0;

  return {
    orgUsed,
    orgRemaining: Math.max(0, LIMITS.ORG_TOKENS_PER_5H - orgUsed),
    orgPct: Math.min(100, Math.round((orgUsed / LIMITS.ORG_TOKENS_PER_5H) * 100)),
    userUsed,
    userRemaining: Math.max(0, LIMITS.USER_TOKENS_PER_5H - userUsed),
    userPct: Math.min(100, Math.round((userUsed / LIMITS.USER_TOKENS_PER_5H) * 100)),
    requestCount,
    windowHours: LIMITS.WINDOW_HOURS,
    limits: LIMITS,
  };
}
