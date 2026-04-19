/**
 * FIRST FTC Events API v2
 * packages/ftc-api/src/ftcEvents.ts
 */

const BASE = "https://ftc-api.firstinspires.org/v2.0";

function auth() {
  const key = process.env.FTC_API_KEY;
  const secret = process.env.FTC_API_SECRET;
  if (!key || !secret) throw new Error("FTC_API_KEY / FTC_API_SECRET not set");
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function ftcFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`FTC API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function getEventSchedule(season: number, eventCode: string) {
  return ftcFetch<{ schedule: unknown[] }>(`/${season}/schedule/${eventCode}?tournamentLevel=qual`);
}

export async function getEventRankings(season: number, eventCode: string) {
  return ftcFetch<{ Rankings: unknown[] }>(`/${season}/rankings/${eventCode}`);
}

export async function getMatchResults(season: number, eventCode: string, matchLevel = "qual") {
  return ftcFetch<{ MatchScores: unknown[] }>(`/${season}/scores/${eventCode}/${matchLevel}`);
}

export async function getEventList(season: number) {
  return ftcFetch<{ events: unknown[] }>(`/${season}/events`);
}
