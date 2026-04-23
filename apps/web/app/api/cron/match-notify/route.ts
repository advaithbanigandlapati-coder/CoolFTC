/**
 * Cron: match-notify. Polls FTC Events API for schedule + recent scores and
 * sends Expo push notifications when something changes:
 *  - A user's team's match is "up next" (within ~3 matches of current)
 *  - Their match starts (FTC API reports postResultTime or actualStartTime)
 *  - Their match's result is posted
 *
 * Uses `push_tokens` for the recipient list (orgId + myTeam combo).
 * Deduplicates notifications via push_notifications_sent table.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@coolfTC/db";
import { getEventMatches } from "@coolfTC/ftc-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Token = { token: string; org_id: string; event_key: string; my_team: string | null };

type NotifyJob = {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  dedupeKey: string;  // (token, event_key, match_num, kind)
};

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: tokens } = await db
    .from("push_tokens")
    .select("token, org_id, event_key, my_team, active")
    .eq("active", true);

  if (!tokens || tokens.length === 0) return NextResponse.json({ sent: 0, reason: "no tokens" });

  // Group by event_key so we fetch each event's matches once
  const byEvent = new Map<string, Token[]>();
  for (const t of tokens as Token[]) {
    if (!t.event_key || !t.my_team) continue;
    if (!byEvent.has(t.event_key)) byEvent.set(t.event_key, []);
    byEvent.get(t.event_key)!.push(t);
  }

  const jobs: NotifyJob[] = [];

  for (const [eventKey, subs] of byEvent) {
    const m = eventKey.match(/^(\d{4})-(.+)$/);
    if (!m) continue;
    const season = Number(m[1]); const code = m[2];

    let matches;
    try { matches = await getEventMatches(season, code); }
    catch { continue; }
    if (!matches.length) continue;

    // Sort qualification matches by match number
    const quals = matches.filter((x) => x.tournamentLevel === "Quals").sort((a, b) => a.matchNum - b.matchNum);
    const lastPlayed = [...quals].reverse().find((q) => q.hasBeenPlayed);
    const lastPlayedNum = lastPlayed?.matchNum ?? 0;

    for (const sub of subs) {
      if (!sub.my_team) continue;
      const myTeam = Number(sub.my_team);
      if (isNaN(myTeam)) continue;

      const myMatches = quals.filter((q) => q.teams.some((t) => t.teamNumber === myTeam));
      for (const match of myMatches) {
        const matchesAway = match.matchNum - lastPlayedNum;

        if (match.hasBeenPlayed && match.scores) {
          // Result posted — announce
          const myAlliance = match.teams.find((t) => t.teamNumber === myTeam)?.alliance;
          if (!myAlliance) continue;
          const myScore = myAlliance === "Red" ? match.scores.red.totalPoints : match.scores.blue.totalPoints;
          const oppScore = myAlliance === "Red" ? match.scores.blue.totalPoints : match.scores.red.totalPoints;
          const verb = myScore > oppScore ? "Won" : myScore < oppScore ? "Lost" : "Tied";
          jobs.push({
            token: sub.token,
            title: `Q${match.matchNum} — ${verb} ${myScore}-${oppScore}`,
            body: `Team ${myTeam} ${verb === "Won" ? "🎉" : verb === "Lost" ? "" : ""}`,
            data: { kind: "result", matchNum: match.matchNum, eventKey, team: myTeam },
            dedupeKey: `${sub.token}|${eventKey}|${match.matchNum}|result`,
          });
        } else if (matchesAway > 0 && matchesAway <= 3) {
          // Match coming up
          jobs.push({
            token: sub.token,
            title: matchesAway === 1 ? `You're on deck — Q${match.matchNum}` : `${matchesAway} matches until Q${match.matchNum}`,
            body: `Team ${myTeam} on ${match.teams.find((t) => t.teamNumber === myTeam)?.alliance} alliance`,
            data: { kind: "onDeck", matchNum: match.matchNum, eventKey, team: myTeam, matchesAway },
            dedupeKey: `${sub.token}|${eventKey}|${match.matchNum}|onDeck|${matchesAway}`,
          });
        }
      }
    }
  }

  if (jobs.length === 0) return NextResponse.json({ sent: 0, reason: "no events to notify" });

  // Dedupe against push_notifications_sent
  const keys = jobs.map((j) => j.dedupeKey);
  const { data: alreadySent } = await db
    .from("push_notifications_sent")
    .select("dedupe_key")
    .in("dedupe_key", keys);
  const sentSet = new Set((alreadySent ?? []).map((r: { dedupe_key: string }) => r.dedupe_key));
  const fresh = jobs.filter((j) => !sentSet.has(j.dedupeKey));

  if (fresh.length === 0) return NextResponse.json({ sent: 0, reason: "all deduped" });

  // Send to Expo in batch
  const payload = fresh.map((j) => ({
    to: j.token,
    title: j.title,
    body: j.body,
    data: j.data,
    sound: "default",
    priority: "high",
  }));

  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `Expo push failed ${resp.status}`, sent: 0 }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err), sent: 0 }, { status: 502 });
  }

  // Persist dedupe keys
  await db.from("push_notifications_sent").insert(fresh.map((j) => ({ dedupe_key: j.dedupeKey, sent_at: new Date().toISOString() })));

  return NextResponse.json({ sent: fresh.length });
}
