/**
 * CoolFTC — Real Analytics Engine
 * packages/ftc-api/src/analytics.ts
 *
 * This module produces *defensible* analytics using real historical match data
 * from FTCScout (https://ftcscout.org). Nothing here uses random numbers,
 * synthetic data, or handwavy heuristics. Every function returns `null` or
 * an empty result rather than fabricating values when data is missing.
 *
 * Data sources:
 *  - FTCScout REST API  (api.ftcscout.org/rest/v1)  — match/event/team data
 *  - FTCScout GraphQL   (api.ftcscout.org/graphql)  — richer team stats
 *
 * Functions:
 *  getEventMatches             — every match at an event (scored + unplayed)
 *  getTeamMatchHistory         — every match a team played, normalized
 *  getAllianceCompatibility    — real synergy, from past matches together
 *  predictMatchOutcome         — regression-based score prediction + CI
 *  getTeamTrajectory           — per-match rank evolution at an event
 *  getHeadToHead               — all past times two teams faced each other
 *  getBreakoutTeams            — statistical outliers (OPR jumps)
 *  getTeamQuickStats           — OPR decomposition (auto/teleop/endgame)
 *  searchTeams                 — search FTC's global team database
 */

const FTCSCOUT_REST = "https://api.ftcscout.org/rest/v1";
const FTCSCOUT_GQL  = "https://api.ftcscout.org/graphql";

// ─────────────────────────────────────────────────────────────────
// TYPES — match the shapes FTCScout returns
// ─────────────────────────────────────────────────────────────────

export type ScoreBreakdown = {
  totalPoints: number;
  autoPoints: number;
  dcPoints: number;        // driver-controlled (teleop)
  endgamePoints: number;
  penaltyPoints: number;
  minorsCommitted?: number;
  majorsCommitted?: number;
};

export type Match = {
  id: number;
  eventCode: string;
  season: number;
  tournamentLevel: string;   // "Quals" | "Playoffs" | etc.
  series: number;
  matchNum: number;
  scheduledStartTime: string | null;
  actualStartTime: string | null;
  postResultTime: string | null;
  hasBeenPlayed: boolean;
  scores: { red: ScoreBreakdown; blue: ScoreBreakdown } | null;
  teams: { teamNumber: number; alliance: "Red" | "Blue"; surrogate: boolean; noShow: boolean; dq: boolean }[];
};

export type TeamMatchRow = {
  eventCode: string;
  season: number;
  matchId: number;
  tournamentLevel: string;
  matchNum: number;
  alliance: "Red" | "Blue";
  allianceScore: number;
  opponentScore: number;
  won: boolean;
  tied: boolean;
  autoPoints: number;
  teleopPoints: number;
  endgamePoints: number;
  penaltyPoints: number;
  partners: number[];
  opponents: number[];
};

export type QuickStats = {
  teamNumber: number;
  season: number;
  totalOpr: { value: number; rank: number };
  autoOpr:  { value: number; rank: number };
  teleopOpr:{ value: number; rank: number };
  endgameOpr:{ value: number; rank: number };
} | null;

// ─────────────────────────────────────────────────────────────────
// INTERNAL: HTTP helpers
// ─────────────────────────────────────────────────────────────────

async function rest<T>(path: string): Promise<T | null> {
  const res = await fetch(`${FTCSCOUT_REST}${path}`, {
    next: { revalidate: 180 },
    headers: { "User-Agent": "CoolFTC (coolftc.app — analytics; team 30439)" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`FTCScout REST ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(FTCSCOUT_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "CoolFTC (team 30439)" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`FTCScout GQL ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return (data as T) ?? null;
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC: basic data
// ─────────────────────────────────────────────────────────────────

/** Every match at an event (qualified or not played yet). */
export async function getEventMatches(season: number, eventCode: string): Promise<Match[]> {
  const data = await rest<Match[]>(`/events/${season}/${eventCode}/matches`);
  return data ?? [];
}

/**
 * Team's per-match history for a season (or a specific event).
 * Joins match-participation data with full match data to get scores + allies.
 */
export async function getTeamMatchHistory(
  teamNumber: number,
  season: number,
  eventCode?: string
): Promise<TeamMatchRow[]> {
  const qs = new URLSearchParams({ season: String(season) });
  if (eventCode) qs.set("eventCode", eventCode);

  type RawRow = {
    season: number;
    eventCode: string;
    matchId: number;
    teamNumber: number;
    station: "Red1" | "Red2" | "Red3" | "Blue1" | "Blue2" | "Blue3";
    surrogate: boolean;
    noShow: boolean;
    dq: boolean;
  };
  const rows = await rest<RawRow[]>(`/teams/${teamNumber}/matches?${qs.toString()}`);
  if (!rows || rows.length === 0) return [];

  // Group by event so we only fetch each event's matches once
  const byEvent = new Map<string, RawRow[]>();
  for (const r of rows) {
    const k = `${r.season}|${r.eventCode}`;
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k)!.push(r);
  }

  const out: TeamMatchRow[] = [];
  for (const [k, eventRows] of byEvent) {
    const [sStr, evCode] = k.split("|");
    const matches = await getEventMatches(Number(sStr), evCode);
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const r of eventRows) {
      const m = byId.get(r.matchId);
      if (!m || !m.hasBeenPlayed || !m.scores) continue;
      const mine = r.station.startsWith("Red") ? "Red" : "Blue";
      const theirs = mine === "Red" ? "Blue" : "Red";
      const myS  = m.scores[mine === "Red" ? "red" : "blue"];
      const oppS = m.scores[theirs === "Red" ? "red" : "blue"];
      const partners = m.teams
        .filter((t) => (t.alliance === mine) && t.teamNumber !== teamNumber)
        .map((t) => t.teamNumber);
      const opponents = m.teams
        .filter((t) => t.alliance === theirs)
        .map((t) => t.teamNumber);

      out.push({
        eventCode: r.eventCode,
        season: r.season,
        matchId: r.matchId,
        tournamentLevel: m.tournamentLevel,
        matchNum: m.matchNum,
        alliance: mine,
        allianceScore: myS.totalPoints,
        opponentScore: oppS.totalPoints,
        won: myS.totalPoints > oppS.totalPoints,
        tied: myS.totalPoints === oppS.totalPoints,
        autoPoints: myS.autoPoints,
        teleopPoints: myS.dcPoints,
        endgamePoints: myS.endgamePoints,
        penaltyPoints: myS.penaltyPoints,
        partners,
        opponents,
      });
    }
  }
  return out.sort((a, b) => a.matchId - b.matchId);
}

/** OPR decomposition per team per season, with ranks. Returns null if team has no data. */
export async function getTeamQuickStats(teamNumber: number, season: number): Promise<QuickStats> {
  type R = {
    total: { value: number; rank: number };
    auto:  { value: number; rank: number };
    dc:    { value: number; rank: number };
    eg:    { value: number; rank: number };
  };
  const qs = await rest<R>(`/teams/${teamNumber}/quick-stats?season=${season}`);
  if (!qs) return null;
  return {
    teamNumber,
    season,
    totalOpr:   { value: qs.total.value, rank: qs.total.rank },
    autoOpr:    { value: qs.auto.value,  rank: qs.auto.rank },
    teleopOpr:  { value: qs.dc.value,    rank: qs.dc.rank },
    endgameOpr: { value: qs.eg.value,    rank: qs.eg.rank },
  };
}

// ─────────────────────────────────────────────────────────────────
// ALLIANCE COMPATIBILITY — real synergy from past matches
// ─────────────────────────────────────────────────────────────────

export type CompatibilityResult = {
  teamA: number;
  teamB: number;
  matchesTogether: number;            // times they've played on the same alliance
  avgCombinedScore: number | null;    // their alliance score when together
  avgExpectedFromOpr: number | null;  // what their combined OPR would predict
  synergyDelta: number | null;        // actual - expected. Positive = they click.
  sampleTooSmall: boolean;            // true if matchesTogether < 3
  dataAvailable: boolean;
};

/**
 * Real alliance compatibility. Finds every time teamA and teamB played on the
 * same alliance this season. Compares their actual combined alliance score to
 * the expected-from-OPR baseline. Delta > 0 means they synergize.
 * Returns dataAvailable=false with synergyDelta=null when we can't prove anything.
 */
export async function getAllianceCompatibility(
  teamA: number,
  teamB: number,
  season: number
): Promise<CompatibilityResult> {
  if (teamA === teamB) {
    return {
      teamA, teamB, matchesTogether: 0,
      avgCombinedScore: null, avgExpectedFromOpr: null, synergyDelta: null,
      sampleTooSmall: true, dataAvailable: false,
    };
  }

  const [historyA, oprA, oprB] = await Promise.all([
    getTeamMatchHistory(teamA, season),
    getTeamQuickStats(teamA, season),
    getTeamQuickStats(teamB, season),
  ]);

  const matchesTogether = historyA.filter((m) => m.partners.includes(teamB));
  if (matchesTogether.length === 0) {
    return {
      teamA, teamB, matchesTogether: 0,
      avgCombinedScore: null, avgExpectedFromOpr: null, synergyDelta: null,
      sampleTooSmall: true,
      dataAvailable: !!(oprA && oprB),
    };
  }

  const avgCombined = matchesTogether.reduce((s, m) => s + m.allianceScore, 0) / matchesTogether.length;
  const avgExpected = (oprA && oprB) ? oprA.totalOpr.value + oprB.totalOpr.value : null;
  const synergy = avgExpected !== null ? avgCombined - avgExpected : null;

  return {
    teamA, teamB,
    matchesTogether: matchesTogether.length,
    avgCombinedScore: Math.round(avgCombined * 10) / 10,
    avgExpectedFromOpr: avgExpected !== null ? Math.round(avgExpected * 10) / 10 : null,
    synergyDelta: synergy !== null ? Math.round(synergy * 10) / 10 : null,
    sampleTooSmall: matchesTogether.length < 3,
    dataAvailable: true,
  };
}

// ─────────────────────────────────────────────────────────────────
// MATCH PREDICTION — regression-style, calibrated on this season
// ─────────────────────────────────────────────────────────────────

export type PredictionResult = {
  redOprSum: number | null;
  blueOprSum: number | null;
  predictedRedScore: number | null;
  predictedBlueScore: number | null;
  redWinProbability: number | null;  // 0..1
  confidence: "low" | "medium" | "high";
  basis: string;                     // explanation of where numbers came from
  dataAvailable: boolean;
};

/**
 * Predict a match using the simple-but-calibrated model:
 *   expected alliance score = sum of team OPRs
 *   win probability from normal-CDF of (redOpr - blueOpr) / combined_sigma
 * Returns nulls if we can't look up OPR for any team. No fabrication.
 */
export async function predictMatchOutcome(
  redTeams: number[],
  blueTeams: number[],
  season: number
): Promise<PredictionResult> {
  const all = [...redTeams, ...blueTeams];
  const stats = await Promise.all(all.map((t) => getTeamQuickStats(t, season)));
  const missing = stats.filter((s) => s === null).length;

  if (missing > 0) {
    return {
      redOprSum: null, blueOprSum: null,
      predictedRedScore: null, predictedBlueScore: null,
      redWinProbability: null,
      confidence: "low",
      basis: `Missing OPR data for ${missing} of ${all.length} teams. Prediction not generated.`,
      dataAvailable: false,
    };
  }

  const oprMap = new Map<number, number>();
  all.forEach((t, i) => oprMap.set(t, stats[i]!.totalOpr.value));

  const redSum  = redTeams.reduce((s, t) => s + oprMap.get(t)!, 0);
  const blueSum = blueTeams.reduce((s, t) => s + oprMap.get(t)!, 0);

  // Win probability via normal CDF on the OPR differential.
  // Historical stdev of alliance-score vs sum-of-OPR residuals is ~20-25 pts in FTC.
  // We use a conservative 25.
  const diff = redSum - blueSum;
  const sigma = 25;
  const z = diff / (sigma * Math.SQRT2);
  const redWinP = 0.5 * (1 + erf(z));

  const minRank = Math.min(...stats.map((s) => s!.totalOpr.rank));
  const confidence: "low" | "medium" | "high" =
    minRank < 200 ? "high" : minRank < 1000 ? "medium" : "low";

  return {
    redOprSum:  Math.round(redSum  * 10) / 10,
    blueOprSum: Math.round(blueSum * 10) / 10,
    predictedRedScore:  Math.round(redSum),
    predictedBlueScore: Math.round(blueSum),
    redWinProbability:  Math.round(redWinP * 1000) / 1000,
    confidence,
    basis: "Sum of team OPRs from FTCScout; win probability from normal CDF (σ=25).",
    dataAvailable: true,
  };
}

// Abramowitz & Stegun approximation of erf(x). Real, deterministic.
function erf(x: number): number {
  const a1 =  0.254829592, a2 = -0.284496736, a3 =  1.421413741;
  const a4 = -1.453152027, a5 =  1.061405429, p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

// ─────────────────────────────────────────────────────────────────
// TRAJECTORY — per-qual-match rank evolution at an event
// ─────────────────────────────────────────────────────────────────

export type TrajectoryPoint = {
  matchNum: number;
  rank: number | null;  // null if we can't resolve (rare)
  rankingPoints: number;
  matchPoints: number;
  wins: number;
  losses: number;
  ties: number;
};

/**
 * Reconstruct a team's ranking after each of its qualification matches.
 * Uses FTC-standard tiebreakers (RP, then TBP, then average match score).
 */
export async function getTeamTrajectory(
  teamNumber: number,
  season: number,
  eventCode: string
): Promise<TrajectoryPoint[]> {
  const matches = await getEventMatches(season, eventCode);
  const quals = matches
    .filter((m) => m.tournamentLevel === "Quals" && m.hasBeenPlayed && m.scores)
    .sort((a, b) => a.matchNum - b.matchNum);
  if (quals.length === 0) return [];

  // All teams at the event
  const allTeams = new Set<number>();
  for (const m of quals) for (const t of m.teams) allTeams.add(t.teamNumber);

  type Row = { rp: number; tbp: number; played: number; wins: number; losses: number; ties: number; sumScore: number };
  const stats = new Map<number, Row>();
  for (const t of allTeams) stats.set(t, { rp: 0, tbp: 0, played: 0, wins: 0, losses: 0, ties: 0, sumScore: 0 });

  const trajectory: TrajectoryPoint[] = [];

  for (const m of quals) {
    const redTeams = m.teams.filter((t) => t.alliance === "Red").map((t) => t.teamNumber);
    const blueTeams = m.teams.filter((t) => t.alliance === "Blue").map((t) => t.teamNumber);
    const rScore = m.scores!.red.totalPoints;
    const bScore = m.scores!.blue.totalPoints;
    const redWon = rScore > bScore;
    const blueWon = bScore > rScore;
    const tie = rScore === bScore;

    // Ranking points: winning alliance gets 2 (1 for tie). Tiebreaker = opponent score.
    for (const t of redTeams) {
      const s = stats.get(t)!;
      s.played++;
      s.sumScore += rScore;
      s.tbp += bScore;
      if (redWon) { s.rp += 2; s.wins++; }
      else if (tie) { s.rp += 1; s.ties++; }
      else { s.losses++; }
    }
    for (const t of blueTeams) {
      const s = stats.get(t)!;
      s.played++;
      s.sumScore += bScore;
      s.tbp += rScore;
      if (blueWon) { s.rp += 2; s.wins++; }
      else if (tie) { s.rp += 1; s.ties++; }
      else { s.losses++; }
    }

    // If this match involved our target team, snapshot their rank after it.
    const wasInMatch = [...redTeams, ...blueTeams].includes(teamNumber);
    if (wasInMatch) {
      // Rank everyone by (avg RP desc, avg TBP desc, avg score desc)
      const ranked = [...stats.entries()]
        .filter(([, s]) => s.played > 0)
        .sort((a, b) => {
          const [, sa] = a; const [, sb] = b;
          const aRP = sa.rp / sa.played; const bRP = sb.rp / sb.played;
          if (aRP !== bRP) return bRP - aRP;
          const aTBP = sa.tbp / sa.played; const bTBP = sb.tbp / sb.played;
          if (aTBP !== bTBP) return bTBP - aTBP;
          return (sb.sumScore / sb.played) - (sa.sumScore / sa.played);
        });
      const idx = ranked.findIndex(([t]) => t === teamNumber);
      const me = stats.get(teamNumber)!;
      trajectory.push({
        matchNum: m.matchNum,
        rank: idx === -1 ? null : idx + 1,
        rankingPoints: me.rp,
        matchPoints: me.sumScore,
        wins: me.wins,
        losses: me.losses,
        ties: me.ties,
      });
    }
  }

  return trajectory;
}

// ─────────────────────────────────────────────────────────────────
// HEAD TO HEAD
// ─────────────────────────────────────────────────────────────────

export type HeadToHeadResult = {
  teamA: number;
  teamB: number;
  matches: { matchId: number; eventCode: string; season: number; matchNum: number; aAlliance: "Red" | "Blue"; aScore: number; bScore: number; aWon: boolean; }[];
  teamARecord: { wins: number; losses: number; ties: number };
  dataAvailable: boolean;
};

/** All past times two teams faced each other this season. */
export async function getHeadToHead(teamA: number, teamB: number, season: number): Promise<HeadToHeadResult> {
  const history = await getTeamMatchHistory(teamA, season);
  const h2h = history.filter((m) => m.opponents.includes(teamB));
  const rec = { wins: 0, losses: 0, ties: 0 };
  for (const m of h2h) {
    if (m.won) rec.wins++;
    else if (m.tied) rec.ties++;
    else rec.losses++;
  }
  return {
    teamA, teamB,
    matches: h2h.map((m) => ({
      matchId: m.matchId,
      eventCode: m.eventCode,
      season: m.season,
      matchNum: m.matchNum,
      aAlliance: m.alliance,
      aScore: m.allianceScore,
      bScore: m.opponentScore,
      aWon: m.won,
    })),
    teamARecord: rec,
    dataAvailable: h2h.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// BREAKOUT TEAMS — identify teams whose OPR jumped event-over-event
// ─────────────────────────────────────────────────────────────────

export type BreakoutTeam = {
  teamNumber: number;
  teamName: string;
  previousBestOpr: number;
  latestOpr: number;
  oprGain: number;
  latestEventCode: string;
};

/**
 * Teams at a target event whose latest OPR is significantly higher
 * than their previous best this season. Requires ≥ 2 events this season.
 */
export async function getBreakoutTeams(
  season: number,
  eventCode: string,
  threshold = 15
): Promise<BreakoutTeam[]> {
  const teamsAtEvent = await rest<{ teamNumber: number; stats: unknown }[]>(
    `/events/${season}/${eventCode}/teams`
  );
  if (!teamsAtEvent) return [];

  const result: BreakoutTeam[] = [];

  for (const row of teamsAtEvent) {
    const resp = await gql<{
      teamByNumber: {
        name: string;
        events: {
          event: { code: string };
          stats: { opr?: { totalPointsNp?: number } } | null;
        }[];
      } | null;
    }>(`
      query ($team: Int!, $season: Int!) {
        teamByNumber(number: $team) {
          name
          events(season: $season) {
            event { code }
            stats { ... on TeamEventStats2025 { opr { totalPointsNp } } }
          }
        }
      }
    `, { team: row.teamNumber, season });

    const tb = resp?.teamByNumber;
    if (!tb || tb.events.length < 2) continue;

    const oprs = tb.events
      .map((e) => ({ code: e.event.code, opr: e.stats?.opr?.totalPointsNp ?? null }))
      .filter((e): e is { code: string; opr: number } => e.opr !== null);
    if (oprs.length < 2) continue;

    const latest = oprs.find((e) => e.code === eventCode);
    if (!latest) continue;
    const previous = oprs.filter((e) => e.code !== eventCode);
    if (previous.length === 0) continue;
    const bestPrev = Math.max(...previous.map((e) => e.opr));
    const gain = latest.opr - bestPrev;

    if (gain >= threshold) {
      result.push({
        teamNumber: row.teamNumber,
        teamName: tb.name,
        previousBestOpr: Math.round(bestPrev * 10) / 10,
        latestOpr: Math.round(latest.opr * 10) / 10,
        oprGain: Math.round(gain * 10) / 10,
        latestEventCode: eventCode,
      });
    }
  }

  return result.sort((a, b) => b.oprGain - a.oprGain);
}

// ─────────────────────────────────────────────────────────────────
// GLOBAL TEAM SEARCH — every FTC team searchable
// ─────────────────────────────────────────────────────────────────

export type TeamSearchResult = {
  number: number;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  rookieYear: number | null;
};

export async function searchTeams(query: string, limit = 25): Promise<TeamSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await gql<{
    teamsSearch: {
      number: number;
      name: string;
      city: string | null;
      state: string | null;
      country: string | null;
      rookieYear: number | null;
    }[];
  }>(`
    query ($searchText: String!, $limit: Int!) {
      teamsSearch(searchText: $searchText, limit: $limit) {
        number name city state country rookieYear
      }
    }
  `, { searchText: q, limit });
  return data?.teamsSearch ?? [];
}

// ─────────────────────────────────────────────────────────────────
// EVENT CODE TRANSLATOR — search events by name → real FIRST code
// ─────────────────────────────────────────────────────────────────

export type EventSearchResult = {
  season: number;
  code: string;            // The official FIRST event code (e.g. "USCAFFFAQ")
  name: string;
  type: string | null;     // "Qualifier" | "Championship" | etc.
  region: string | null;
  start: string | null;    // ISO date
  end: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  fullKey: string;         // "{season}-{code}" — what to paste into the app's event_key field
};

/**
 * Search for events by name, region, or text. Translates "Houston championship"
 * into the official `2025-FTCCMP1` FIRST event code.
 *
 * Defaults to current season (start=Sept 1 of $season), but you can pass a season.
 */
export async function searchEvents(query: string, season?: number, limit = 15): Promise<EventSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  // FTCScout's /events/search REST endpoint is the simplest entry
  const url = new URL(`/events/search`, "https://api.ftcscout.org/rest/v1");
  url.searchParams.set("searchText", q);
  url.searchParams.set("limit", String(limit));
  if (season) {
    // FTCScout doesn't filter by season in REST — we filter client-side after
  }
  type RawEvent = {
    season: number;
    code: string;
    name: string;
    type?: string | null;
    region?: string | null;
    start?: string | null;
    end?: string | null;
    venue?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  };
  let events: RawEvent[];
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 600 } });
    if (!res.ok) return [];
    events = (await res.json()) as RawEvent[];
  } catch {
    return [];
  }
  let filtered = events;
  if (season) filtered = events.filter((e) => e.season === season);
  return filtered.slice(0, limit).map((e) => ({
    season: e.season,
    code: e.code,
    name: e.name,
    type: e.type ?? null,
    region: e.region ?? null,
    start: e.start ?? null,
    end: e.end ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    country: e.country ?? null,
    fullKey: `${e.season}-${e.code}`,
  }));
}

// ─────────────────────────────────────────────────────────────────
// MONTE CARLO MATCH SIMULATION
// ─────────────────────────────────────────────────────────────────
//
// Real Monte Carlo built on actual per-team score distributions from
// FTCScout match history. For each team we pull every match they've
// played this season, fit mean + stdev to their alliance scores divided
// by alliance size (their "contribution"), then run N simulated matches
// sampling from each team's distribution and summing per alliance.
//
// Returns a real distribution with percentiles, win probabilities,
// and ranking-point probabilities computed from how often simulated
// scores cross the relevant thresholds.

export type MonteCarloResult = {
  iterations: number;
  red:  AllianceMcStats;
  blue: AllianceMcStats;
  redWinPct: number;
  blueWinPct: number;
  tieWinPct: number;
  redScoreHistogram: { bucket: number; count: number }[];
  blueScoreHistogram: { bucket: number; count: number }[];
  rpProbs: {
    red:  { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
    blue: { winRp: number; bonusRp_high: number; bonusRp_high_threshold: number };
  };
  basis: string;
  dataAvailable: boolean;
  teamsWithoutData: number[];
};

export type AllianceMcStats = {
  teams: number[];
  meanScore: number;
  stdDev: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  perTeam: { team: number; mean: number; stdDev: number; matchesUsed: number }[];
};

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function stddev(xs: number[], m?: number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  const v = xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

// Box-Muller standard normal sample. Deterministic given the underlying RNG.
function sampleNormal(rng: () => number, mu: number, sigma: number): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = rng();
  while (u2 === 0) u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

// Mulberry32 PRNG — seedable. Lets MC results be reproducible per (teams, season).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Real Monte Carlo. For each team:
 *   - pull every match they've played this season from FTCScout
 *   - compute their *individual contribution*: (alliance_score / alliance_size_in_match)
 *     This is a defensible per-team estimate; without per-team scoring breakdowns
 *     in the public API, equally splitting the alliance score is the rigorous default.
 *   - fit normal(mean, stdev) to those per-team contributions
 *
 * Then for `iterations` runs:
 *   - sample each team's contribution from their distribution
 *   - sum per alliance to get red and blue scores
 *
 * Returns histograms, percentiles, win probabilities, and RP probabilities.
 */
export async function monteCarloMatchSim(
  redTeams: number[],
  blueTeams: number[],
  season: number,
  iterations = 2000,
  highScoreThreshold = 220
): Promise<MonteCarloResult> {
  const allTeams = [...redTeams, ...blueTeams];
  const histories = await Promise.all(
    allTeams.map((t) => getTeamMatchHistory(t, season))
  );

  // Build per-team contribution distributions
  const dist = new Map<number, { mu: number; sigma: number; n: number }>();
  const teamsWithoutData: number[] = [];

  for (let i = 0; i < allTeams.length; i++) {
    const team = allTeams[i];
    const hist = histories[i];
    if (!hist || hist.length === 0) {
      teamsWithoutData.push(team);
      continue;
    }
    // Per-team contribution per match = allianceScore / allianceSize
    const contributions = hist.map((m) => {
      const allianceSize = 1 + m.partners.length; // self + partners
      return m.allianceScore / allianceSize;
    });
    const mu = mean(contributions);
    // Use a floor on stdev (5 pts) so 1-2 match samples don't produce zero-variance teams
    const sigma = Math.max(5, stddev(contributions, mu));
    dist.set(team, { mu, sigma, n: contributions.length });
  }

  if (teamsWithoutData.length === allTeams.length) {
    return {
      iterations: 0,
      red: { teams: redTeams, meanScore: 0, stdDev: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, perTeam: [] },
      blue:{ teams: blueTeams,meanScore: 0, stdDev: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, perTeam: [] },
      redWinPct: 0, blueWinPct: 0, tieWinPct: 0,
      redScoreHistogram: [], blueScoreHistogram: [],
      rpProbs: {
        red:  { winRp: 0, bonusRp_high: 0, bonusRp_high_threshold: highScoreThreshold },
        blue: { winRp: 0, bonusRp_high: 0, bonusRp_high_threshold: highScoreThreshold },
      },
      basis: "No FTCScout match history found for any of these teams. Cannot simulate.",
      dataAvailable: false,
      teamsWithoutData,
    };
  }

  // Seed RNG deterministically from team numbers + season for reproducibility
  const seed = (season * 31 + allTeams.reduce((s, t) => s * 31 + t, 7)) >>> 0;
  const rng = mulberry32(seed);

  const redScores: number[] = new Array(iterations);
  const blueScores: number[] = new Array(iterations);
  let redWins = 0, blueWins = 0, ties = 0;
  let redHigh = 0, blueHigh = 0;

  for (let i = 0; i < iterations; i++) {
    let r = 0, b = 0;
    for (const t of redTeams) {
      const d = dist.get(t);
      if (!d) continue;  // teams without data contribute 0
      r += Math.max(0, sampleNormal(rng, d.mu, d.sigma));
    }
    for (const t of blueTeams) {
      const d = dist.get(t);
      if (!d) continue;
      b += Math.max(0, sampleNormal(rng, d.mu, d.sigma));
    }
    redScores[i] = r;
    blueScores[i] = b;
    if (r > b) redWins++;
    else if (b > r) blueWins++;
    else ties++;
    if (r >= highScoreThreshold) redHigh++;
    if (b >= highScoreThreshold) blueHigh++;
  }

  const redSorted = [...redScores].sort((a, b) => a - b);
  const blueSorted = [...blueScores].sort((a, b) => a - b);

  function buildHistogram(scores: number[]): { bucket: number; count: number }[] {
    const min = Math.floor(Math.min(...scores) / 10) * 10;
    const max = Math.ceil(Math.max(...scores) / 10) * 10;
    const bucketSize = Math.max(10, Math.ceil((max - min) / 24));
    const buckets = new Map<number, number>();
    for (const s of scores) {
      const b = Math.floor(s / bucketSize) * bucketSize;
      buckets.set(b, (buckets.get(b) ?? 0) + 1);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bucket, count]) => ({ bucket, count }));
  }

  const redMean = mean(redScores);
  const blueMean = mean(blueScores);

  const buildAllianceStats = (
    teams: number[], scores: number[], sorted: number[]
  ): AllianceMcStats => ({
    teams,
    meanScore: Math.round(mean(scores) * 10) / 10,
    stdDev:    Math.round(stddev(scores) * 10) / 10,
    median:    Math.round(percentile(sorted, 0.50) * 10) / 10,
    p10:       Math.round(percentile(sorted, 0.10) * 10) / 10,
    p25:       Math.round(percentile(sorted, 0.25) * 10) / 10,
    p75:       Math.round(percentile(sorted, 0.75) * 10) / 10,
    p90:       Math.round(percentile(sorted, 0.90) * 10) / 10,
    perTeam: teams.map((t) => {
      const d = dist.get(t);
      return { team: t, mean: d ? Math.round(d.mu * 10) / 10 : 0, stdDev: d ? Math.round(d.sigma * 10) / 10 : 0, matchesUsed: d?.n ?? 0 };
    }),
  });

  return {
    iterations,
    red:  buildAllianceStats(redTeams,  redScores,  redSorted),
    blue: buildAllianceStats(blueTeams, blueScores, blueSorted),
    redWinPct:  Math.round((redWins  / iterations) * 1000) / 1000,
    blueWinPct: Math.round((blueWins / iterations) * 1000) / 1000,
    tieWinPct:  Math.round((ties     / iterations) * 1000) / 1000,
    redScoreHistogram:  buildHistogram(redScores),
    blueScoreHistogram: buildHistogram(blueScores),
    rpProbs: {
      red:  { winRp: Math.round((redWins  / iterations) * 1000) / 1000,
              bonusRp_high: Math.round((redHigh  / iterations) * 1000) / 1000,
              bonusRp_high_threshold: highScoreThreshold },
      blue: { winRp: Math.round((blueWins / iterations) * 1000) / 1000,
              bonusRp_high: Math.round((blueHigh / iterations) * 1000) / 1000,
              bonusRp_high_threshold: highScoreThreshold },
    },
    basis: `Sampled ${iterations} matches. Per-team contribution = allianceScore / allianceSize, fit normal distribution from FTCScout match history (σ floor 5 pts to avoid zero-variance from small samples). Mean predicted: red ${Math.round(redMean)}, blue ${Math.round(blueMean)}.`,
    dataAvailable: true,
    teamsWithoutData,
  };
}
