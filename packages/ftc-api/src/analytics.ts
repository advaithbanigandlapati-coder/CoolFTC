/**
 * CoolFTC — Real Analytics Engine
 * packages/ftc-api/src/analytics.ts
 *
 * All data from FTCScout public API. Nothing fabricated.
 */

const FTCSCOUT_REST = "https://api.ftcscout.org/rest/v1";
const FTCSCOUT_GQL  = "https://api.ftcscout.org/graphql";

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export type ScoreBreakdown = {
  totalPoints: number;
  autoPoints: number;
  dcPoints: number;
  endgamePoints: number;
  penaltyPoints: number;
};

export type Match = {
  id: number;
  eventCode: string;
  season: number;
  tournamentLevel: string;
  matchNum: number;
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
  totalOpr:   { value: number; rank: number };
  autoOpr:    { value: number; rank: number };
  teleopOpr:  { value: number; rank: number };
  endgameOpr: { value: number; rank: number };
} | null;

// ─────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────

async function rest<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${FTCSCOUT_REST}${path}`, {
      // @ts-ignore next-specific
      next: { revalidate: 180 },
      headers: { "User-Agent": "CoolFTC (coolftc.app; team 30439)" },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`FTCScout REST ${res.status}`);
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(FTCSCOUT_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "CoolFTC (team 30439)" },
      body: JSON.stringify({ query, variables }),
      // @ts-ignore next-specific
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const { data, errors } = await res.json();
    if (errors?.length) return null;
    return (data as T) ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// EVENT MATCHES
// ─────────────────────────────────────────────────────────────────

export async function getEventMatches(season: number, eventCode: string): Promise<Match[]> {
  const data = await rest<Match[]>(`/events/${season}/${eventCode}/matches`);
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────
// TEAM MATCH HISTORY
// ─────────────────────────────────────────────────────────────────

export async function getTeamMatchHistory(
  teamNumber: number,
  season: number,
  eventCode?: string
): Promise<TeamMatchRow[]> {
  const qs = new URLSearchParams({ season: String(season) });
  if (eventCode) qs.set("eventCode", eventCode);

  type RawRow = {
    season: number; eventCode: string; matchId: number; teamNumber: number;
    station: "Red1"|"Red2"|"Red3"|"Blue1"|"Blue2"|"Blue3";
    surrogate: boolean; noShow: boolean; dq: boolean;
  };
  const rows = await rest<RawRow[]>(`/teams/${teamNumber}/matches?${qs.toString()}`);
  if (!rows?.length) return [];

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
      if (!m?.hasBeenPlayed || !m.scores) continue;
      const mine   = r.station.startsWith("Red") ? "Red" : "Blue";
      const theirs = mine === "Red" ? "Blue" : "Red";
      const myS    = m.scores[mine   === "Red" ? "red" : "blue"];
      const oppS   = m.scores[theirs === "Red" ? "red" : "blue"];
      const partners  = m.teams.filter(t => t.alliance === mine   && t.teamNumber !== teamNumber).map(t => t.teamNumber);
      const opponents = m.teams.filter(t => t.alliance === theirs).map(t => t.teamNumber);
      out.push({
        eventCode: r.eventCode, season: r.season, matchId: r.matchId,
        tournamentLevel: m.tournamentLevel, matchNum: m.matchNum,
        alliance: mine,
        allianceScore: myS.totalPoints, opponentScore: oppS.totalPoints,
        won: myS.totalPoints > oppS.totalPoints, tied: myS.totalPoints === oppS.totalPoints,
        autoPoints: myS.autoPoints, teleopPoints: myS.dcPoints,
        endgamePoints: myS.endgamePoints, penaltyPoints: myS.penaltyPoints,
        partners, opponents,
      });
    }
  }
  return out.sort((a, b) => a.matchId - b.matchId);
}

// ─────────────────────────────────────────────────────────────────
// QUICK STATS — FIX: FTCScout REST uses "tot" not "total"
// ─────────────────────────────────────────────────────────────────

export async function getTeamQuickStats(teamNumber: number, season: number): Promise<QuickStats> {
  // FTCScout REST /rest/v1/teams/{num}/quick-stats returns:
  //   { tot: { value, rank }, auto: { value, rank }, dc: { value, rank }, eg: { value, rank } }
  // NOTE: field is "tot" NOT "total" — using wrong name was the crash source.
  type R = {
    tot:  { value: number; rank: number } | null;
    auto: { value: number; rank: number } | null;
    dc:   { value: number; rank: number } | null;
    eg:   { value: number; rank: number } | null;
  };
  const qs = await rest<R>(`/teams/${teamNumber}/quick-stats?season=${season}`);
  // Return null if the endpoint 404'd or the team has no data this season
  if (!qs || !qs.tot || !qs.auto || !qs.dc || !qs.eg) return null;
  // Extra safety: check each .value is a number
  if (typeof qs.tot.value  !== "number") return null;
  if (typeof qs.auto.value !== "number") return null;
  return {
    teamNumber, season,
    totalOpr:   { value: qs.tot.value,  rank: qs.tot.rank  ?? 9999 },
    autoOpr:    { value: qs.auto.value, rank: qs.auto.rank ?? 9999 },
    teleopOpr:  { value: qs.dc.value,   rank: qs.dc.rank   ?? 9999 },
    endgameOpr: { value: qs.eg.value,   rank: qs.eg.rank   ?? 9999 },
  };
}

// ─────────────────────────────────────────────────────────────────
// ALLIANCE COMPATIBILITY
// ─────────────────────────────────────────────────────────────────

export type CompatibilityResult = {
  teamA: number; teamB: number;
  matchesTogether: number;
  avgCombinedScore: number | null;
  avgExpectedFromOpr: number | null;
  synergyDelta: number | null;
  sampleTooSmall: boolean;
  dataAvailable: boolean;
};

export async function getAllianceCompatibility(
  teamA: number, teamB: number, season: number
): Promise<CompatibilityResult> {
  if (teamA === teamB) return {
    teamA, teamB, matchesTogether: 0, avgCombinedScore: null,
    avgExpectedFromOpr: null, synergyDelta: null, sampleTooSmall: true, dataAvailable: false,
  };

  const [historyA, oprA, oprB] = await Promise.all([
    getTeamMatchHistory(teamA, season),
    getTeamQuickStats(teamA, season),
    getTeamQuickStats(teamB, season),
  ]);

  const together = historyA.filter(m => m.partners.includes(teamB));
  if (!together.length) return {
    teamA, teamB, matchesTogether: 0, avgCombinedScore: null,
    avgExpectedFromOpr: null, synergyDelta: null, sampleTooSmall: true,
    dataAvailable: !!(oprA && oprB),
  };

  const avgCombined = together.reduce((s, m) => s + m.allianceScore, 0) / together.length;
  const avgExpected = (oprA && oprB) ? oprA.totalOpr.value + oprB.totalOpr.value : null;
  const synergy = avgExpected !== null ? avgCombined - avgExpected : null;

  return {
    teamA, teamB, matchesTogether: together.length,
    avgCombinedScore:   Math.round(avgCombined * 10) / 10,
    avgExpectedFromOpr: avgExpected !== null ? Math.round(avgExpected * 10) / 10 : null,
    synergyDelta:       synergy     !== null ? Math.round(synergy     * 10) / 10 : null,
    sampleTooSmall: together.length < 3, dataAvailable: true,
  };
}

// ─────────────────────────────────────────────────────────────────
// MATCH PREDICTION
// ─────────────────────────────────────────────────────────────────

export type PredictionResult = {
  redOprSum: number | null; blueOprSum: number | null;
  predictedRedScore: number | null; predictedBlueScore: number | null;
  redWinProbability: number | null;
  confidence: "low" | "medium" | "high";
  basis: string; dataAvailable: boolean;
};

function erf(x: number): number {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1; const ax = Math.abs(x);
  const t = 1/(1 + p*ax);
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);
  return sign*y;
}

export async function predictMatchOutcome(
  redTeams: number[], blueTeams: number[], season: number
): Promise<PredictionResult> {
  const all = [...redTeams, ...blueTeams];
  const stats = await Promise.all(all.map(t => getTeamQuickStats(t, season)));
  const missing = stats.filter(s => s === null).length;

  if (missing > 0) return {
    redOprSum: null, blueOprSum: null,
    predictedRedScore: null, predictedBlueScore: null,
    redWinProbability: null, confidence: "low",
    basis: `Missing OPR data for ${missing} of ${all.length} teams. Teams may not have played matches yet this season.`,
    dataAvailable: false,
  };

  const oprMap = new Map<number, number>();
  all.forEach((t, i) => oprMap.set(t, stats[i]!.totalOpr.value));

  const redSum  = redTeams .reduce((s, t) => s + (oprMap.get(t) ?? 0), 0);
  const blueSum = blueTeams.reduce((s, t) => s + (oprMap.get(t) ?? 0), 0);

  const diff = redSum - blueSum;
  const z = diff / (25 * Math.SQRT2);
  const redWinP = 0.5 * (1 + erf(z));

  const minRank = Math.min(...stats.map(s => s!.totalOpr.rank));
  const confidence: "low"|"medium"|"high" = minRank < 200 ? "high" : minRank < 1000 ? "medium" : "low";

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

// ─────────────────────────────────────────────────────────────────
// TRAJECTORY
// ─────────────────────────────────────────────────────────────────

export type TrajectoryPoint = {
  matchNum: number; rank: number | null;
  rankingPoints: number; matchPoints: number;
  wins: number; losses: number; ties: number;
};

export async function getTeamTrajectory(
  teamNumber: number, season: number, eventCode: string
): Promise<TrajectoryPoint[]> {
  const matches = await getEventMatches(season, eventCode);
  const quals = matches
    .filter(m => m.tournamentLevel === "Quals" && m.hasBeenPlayed && m.scores)
    .sort((a, b) => a.matchNum - b.matchNum);
  if (!quals.length) return [];

  const allTeams = new Set<number>();
  for (const m of quals) for (const t of m.teams) allTeams.add(t.teamNumber);

  type Row = { rp:number; tbp:number; played:number; wins:number; losses:number; ties:number; sumScore:number };
  const stats = new Map<number, Row>();
  for (const t of allTeams) stats.set(t, { rp:0, tbp:0, played:0, wins:0, losses:0, ties:0, sumScore:0 });

  const trajectory: TrajectoryPoint[] = [];

  for (const m of quals) {
    const redT  = m.teams.filter(t => t.alliance==="Red" ).map(t => t.teamNumber);
    const blueT = m.teams.filter(t => t.alliance==="Blue").map(t => t.teamNumber);
    const rScore = m.scores!.red.totalPoints;
    const bScore = m.scores!.blue.totalPoints;
    const redWon = rScore > bScore; const blueWon = bScore > rScore; const tie = rScore === bScore;

    for (const t of redT) {
      const s = stats.get(t)!;
      s.played++; s.sumScore += rScore; s.tbp += bScore;
      if (redWon) { s.rp+=2; s.wins++; } else if (tie) { s.rp+=1; s.ties++; } else s.losses++;
    }
    for (const t of blueT) {
      const s = stats.get(t)!;
      s.played++; s.sumScore += bScore; s.tbp += rScore;
      if (blueWon) { s.rp+=2; s.wins++; } else if (tie) { s.rp+=1; s.ties++; } else s.losses++;
    }

    if ([...redT, ...blueT].includes(teamNumber)) {
      const ranked = [...stats.entries()]
        .filter(([, s]) => s.played > 0)
        .sort((a, b) => {
          const [,sa]=[a[0],a[1]]; const [,sb]=[b[0],b[1]];
          const aRP=sa.rp/sa.played; const bRP=sb.rp/sb.played;
          if (aRP !== bRP) return bRP - aRP;
          const aTBP=sa.tbp/sa.played; const bTBP=sb.tbp/sb.played;
          if (aTBP !== bTBP) return bTBP - aTBP;
          return (sb.sumScore/sb.played) - (sa.sumScore/sa.played);
        });
      const idx = ranked.findIndex(([t]) => t === teamNumber);
      const me = stats.get(teamNumber)!;
      trajectory.push({ matchNum: m.matchNum, rank: idx===-1?null:idx+1,
        rankingPoints: me.rp, matchPoints: me.sumScore,
        wins: me.wins, losses: me.losses, ties: me.ties });
    }
  }
  return trajectory;
}

// ─────────────────────────────────────────────────────────────────
// HEAD TO HEAD
// ─────────────────────────────────────────────────────────────────

export type HeadToHeadResult = {
  teamA: number; teamB: number;
  matches: { matchId:number; eventCode:string; season:number; matchNum:number; aAlliance:"Red"|"Blue"; aScore:number; bScore:number; aWon:boolean }[];
  teamARecord: { wins:number; losses:number; ties:number };
  dataAvailable: boolean;
};

export async function getHeadToHead(teamA: number, teamB: number, season: number): Promise<HeadToHeadResult> {
  const history = await getTeamMatchHistory(teamA, season);
  const h2h = history.filter(m => m.opponents.includes(teamB));
  const rec = { wins:0, losses:0, ties:0 };
  for (const m of h2h) { if (m.won) rec.wins++; else if (m.tied) rec.ties++; else rec.losses++; }
  return {
    teamA, teamB,
    matches: h2h.map(m => ({
      matchId: m.matchId, eventCode: m.eventCode, season: m.season, matchNum: m.matchNum,
      aAlliance: m.alliance, aScore: m.allianceScore, bScore: m.opponentScore, aWon: m.won,
    })),
    teamARecord: rec, dataAvailable: h2h.length > 0,
  };
}

// ─────────────────────────────────────────────────────────────────
// BREAKOUT TEAMS
// ─────────────────────────────────────────────────────────────────

export type BreakoutTeam = {
  teamNumber:number; teamName:string; previousBestOpr:number;
  latestOpr:number; oprGain:number; latestEventCode:string;
};

export async function getBreakoutTeams(season:number, eventCode:string, threshold=15): Promise<BreakoutTeam[]> {
  const teamsAtEvent = await rest<{ teamNumber:number }[]>(`/events/${season}/${eventCode}/teams`);
  if (!teamsAtEvent) return [];

  const result: BreakoutTeam[] = [];
  for (const row of teamsAtEvent) {
    const resp = await gql<{
      teamByNumber: { name:string; events: { event:{code:string}; stats:{ opr?:{totalPointsNp?:number} }|null }[] }|null;
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
      .map(e => ({ code: e.event.code, opr: e.stats?.opr?.totalPointsNp ?? null }))
      .filter((e): e is { code:string; opr:number } => e.opr !== null);
    if (oprs.length < 2) continue;
    const latest = oprs.find(e => e.code === eventCode);
    if (!latest) continue;
    const previous = oprs.filter(e => e.code !== eventCode);
    if (!previous.length) continue;
    const bestPrev = Math.max(...previous.map(e => e.opr));
    const gain = latest.opr - bestPrev;
    if (gain >= threshold) result.push({
      teamNumber: row.teamNumber, teamName: tb.name,
      previousBestOpr: Math.round(bestPrev*10)/10,
      latestOpr: Math.round(latest.opr*10)/10,
      oprGain: Math.round(gain*10)/10,
      latestEventCode: eventCode,
    });
  }
  return result.sort((a, b) => b.oprGain - a.oprGain);
}

// ─────────────────────────────────────────────────────────────────
// TEAM SEARCH
// ─────────────────────────────────────────────────────────────────

export type TeamSearchResult = {
  number:number; name:string; city:string|null; state:string|null;
  country:string|null; rookieYear:number|null;
};

export async function searchTeams(query:string, limit=25): Promise<TeamSearchResult[]> {
  const q = query.trim(); if (!q) return [];
  const data = await gql<{ teamsSearch: TeamSearchResult[] }>(`
    query ($searchText: String!, $limit: Int!) {
      teamsSearch(searchText: $searchText, limit: $limit) {
        number name city state country rookieYear
      }
    }
  `, { searchText: q, limit });
  return data?.teamsSearch ?? [];
}

// ─────────────────────────────────────────────────────────────────
// EVENT SEARCH
// ─────────────────────────────────────────────────────────────────

export type EventSearchResult = {
  season:number; code:string; name:string; type:string|null; region:string|null;
  start:string|null; end:string|null; city:string|null; state:string|null; country:string|null;
  fullKey:string;
};

export async function searchEvents(query:string, season?:number, limit=15): Promise<EventSearchResult[]> {
  const q = query.trim(); if (!q) return [];
  try {
    const url = new URL("/events/search", "https://api.ftcscout.org/rest/v1");
    url.searchParams.set("searchText", q);
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const events: Record<string, unknown>[] = await res.json();
    const filtered = season ? events.filter(e => e.season === season) : events;
    return filtered.slice(0, limit).map(e => ({
      season: e.season as number, code: e.code as string, name: e.name as string,
      type: (e.type as string|null) ?? null, region: (e.region as string|null) ?? null,
      start: (e.start as string|null) ?? null, end: (e.end as string|null) ?? null,
      city: (e.city as string|null) ?? null, state: (e.state as string|null) ?? null,
      country: (e.country as string|null) ?? null,
      fullKey: `${e.season}-${e.code}`,
    }));
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────
// MONTE CARLO MATCH SIMULATION
// ─────────────────────────────────────────────────────────────────

export type MonteCarloResult = {
  iterations: number;
  red:  AllianceMcStats; blue: AllianceMcStats;
  redWinPct:number; blueWinPct:number; tieWinPct:number;
  redScoreHistogram: {bucket:number;count:number}[];
  blueScoreHistogram:{bucket:number;count:number}[];
  rpProbs: {
    red:  {winRp:number; bonusRp_high:number; bonusRp_high_threshold:number};
    blue: {winRp:number; bonusRp_high:number; bonusRp_high_threshold:number};
  };
  basis:string; dataAvailable:boolean; teamsWithoutData:number[];
};

export type AllianceMcStats = {
  teams:number[]; meanScore:number; stdDev:number; median:number;
  p10:number; p25:number; p75:number; p90:number;
  perTeam:{team:number; mean:number; stdDev:number; matchesUsed:number}[];
};

function mean(xs:number[]): number { return xs.reduce((a,b)=>a+b,0)/xs.length; }
function stddev(xs:number[], m?:number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  return Math.sqrt(xs.reduce((s,x)=>s+(x-mu)**2,0)/(xs.length-1));
}
function percentile(sorted:number[], p:number): number {
  if (!sorted.length) return 0;
  const idx=(sorted.length-1)*p; const lo=Math.floor(idx); const hi=Math.ceil(idx);
  if (lo===hi) return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
}
function sampleNormal(rng:()=>number, mu:number, sigma:number): number {
  let u1=0, u2=0;
  while(u1===0) u1=rng(); while(u2===0) u2=rng();
  return mu + sigma * Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
}
function mulberry32(seed:number): ()=>number {
  let s = seed >>> 0;
  return function() {
    s |= 0; s=(s+0x6D2B79F5)|0;
    let t=Math.imul(s^(s>>>15),1|s);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

export async function monteCarloMatchSim(
  redTeams:number[], blueTeams:number[], season:number,
  iterations=2000, highScoreThreshold=220
): Promise<MonteCarloResult> {
  const allTeams = [...redTeams, ...blueTeams];
  const histories = await Promise.all(allTeams.map(t => getTeamMatchHistory(t, season)));

  const dist = new Map<number, {mu:number; sigma:number; n:number}>();
  const teamsWithoutData: number[] = [];

  for (let i=0; i<allTeams.length; i++) {
    const team = allTeams[i]; const hist = histories[i];
    if (!hist?.length) { teamsWithoutData.push(team); continue; }
    const contribs = hist.map(m => m.allianceScore / Math.max(1, 1 + m.partners.length));
    const mu = mean(contribs);
    dist.set(team, { mu, sigma: Math.max(5, stddev(contribs, mu)), n: contribs.length });
  }

  if (teamsWithoutData.length === allTeams.length) {
    const empty: AllianceMcStats = {
      teams:[], meanScore:0, stdDev:0, median:0, p10:0, p25:0, p75:0, p90:0, perTeam:[],
    };
    return {
      iterations:0, red:empty, blue:empty,
      redWinPct:0, blueWinPct:0, tieWinPct:0,
      redScoreHistogram:[], blueScoreHistogram:[],
      rpProbs:{
        red: {winRp:0,bonusRp_high:0,bonusRp_high_threshold:highScoreThreshold},
        blue:{winRp:0,bonusRp_high:0,bonusRp_high_threshold:highScoreThreshold},
      },
      basis:"No FTCScout match history for any of these teams. Cannot simulate.",
      dataAvailable:false, teamsWithoutData,
    };
  }

  const seed = (season*31 + allTeams.reduce((s,t)=>s*31+t,7))>>>0;
  const rng = mulberry32(seed);
  const redScores = new Array<number>(iterations);
  const blueScores = new Array<number>(iterations);
  let redWins=0, blueWins=0, ties=0, redHigh=0, blueHigh=0;

  for (let i=0; i<iterations; i++) {
    let r=0, b=0;
    for (const t of redTeams)  { const d=dist.get(t); if(d) r+=Math.max(0,sampleNormal(rng,d.mu,d.sigma)); }
    for (const t of blueTeams) { const d=dist.get(t); if(d) b+=Math.max(0,sampleNormal(rng,d.mu,d.sigma)); }
    redScores[i]=r; blueScores[i]=b;
    if(r>b) redWins++; else if(b>r) blueWins++; else ties++;
    if(r>=highScoreThreshold) redHigh++;
    if(b>=highScoreThreshold) blueHigh++;
  }

  const rS=[...redScores].sort((a,b)=>a-b);
  const bS=[...blueScores].sort((a,b)=>a-b);

  function buildHist(scores:number[]): {bucket:number;count:number}[] {
    const mn=Math.floor(Math.min(...scores)/10)*10;
    const mx=Math.ceil(Math.max(...scores)/10)*10;
    const bSize=Math.max(10,Math.ceil((mx-mn)/24));
    const buckets=new Map<number,number>();
    for(const s of scores){ const b=Math.floor(s/bSize)*bSize; buckets.set(b,(buckets.get(b)??0)+1); }
    return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).map(([bucket,count])=>({bucket,count}));
  }

  const buildStats = (teams:number[], scores:number[], sorted:number[]): AllianceMcStats => ({
    teams,
    meanScore: Math.round(mean(scores)*10)/10,
    stdDev:    Math.round(stddev(scores)*10)/10,
    median:    Math.round(percentile(sorted,0.50)*10)/10,
    p10:       Math.round(percentile(sorted,0.10)*10)/10,
    p25:       Math.round(percentile(sorted,0.25)*10)/10,
    p75:       Math.round(percentile(sorted,0.75)*10)/10,
    p90:       Math.round(percentile(sorted,0.90)*10)/10,
    perTeam: teams.map(t => {
      const d=dist.get(t);
      return {team:t, mean:d?Math.round(d.mu*10)/10:0, stdDev:d?Math.round(d.sigma*10)/10:0, matchesUsed:d?.n??0};
    }),
  });

  const redMean = mean(redScores); const blueMean = mean(blueScores);
  return {
    iterations,
    red:  buildStats(redTeams,  redScores,  rS),
    blue: buildStats(blueTeams, blueScores, bS),
    redWinPct:  Math.round((redWins /iterations)*1000)/1000,
    blueWinPct: Math.round((blueWins/iterations)*1000)/1000,
    tieWinPct:  Math.round((ties    /iterations)*1000)/1000,
    redScoreHistogram:  buildHist(redScores),
    blueScoreHistogram: buildHist(blueScores),
    rpProbs: {
      red:  {winRp:Math.round((redWins /iterations)*1000)/1000, bonusRp_high:Math.round((redHigh /iterations)*1000)/1000, bonusRp_high_threshold:highScoreThreshold},
      blue: {winRp:Math.round((blueWins/iterations)*1000)/1000, bonusRp_high:Math.round((blueHigh/iterations)*1000)/1000, bonusRp_high_threshold:highScoreThreshold},
    },
    basis: `${iterations} simulations. Per-team contribution = allianceScore/allianceSize (σ floor 5). Mean: red ${Math.round(redMean)}, blue ${Math.round(blueMean)}.`,
    dataAvailable: true, teamsWithoutData,
  };
}
