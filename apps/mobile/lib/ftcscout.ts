/**
 * FTCscout + FIRST Tech Challenge public API client
 * GraphQL: https://api.ftcscout.org/graphql
 * Season 2025 = DECODE 2025–26
 */

const ENDPOINT = "https://api.ftcscout.org/graphql";
export const FTC_SEASON = 2025;

// ── Core GraphQL fetcher ─────────────────────────────────────────────────────

async function gql<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`FTCscout HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type FTCTeam = {
  number: number;
  name: string;
  schoolName: string | null;
  city: string | null;
  stateProv: string | null;
  country: string | null;
};

export type FTCEventSummary = {
  event: { name: string; code: string; start: string; end: string };
  ranking: { rank: number; wins: number; losses: number; ties: number } | null;
};

export type FTCTeamDetail = FTCTeam & {
  events: FTCEventSummary[];
};

export type FTCEventTeam = {
  team: { number: number; name: string };
  ranking: {
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    rp: number;
    tbp: number;
    qualMatchesPlayed: number;
  } | null;
};

export type FTCEvent = {
  name: string;
  start: string;
  end: string;
  code?: string;
  teams: FTCEventTeam[];
};

// ── Search queries ────────────────────────────────────────────────────────────

/**
 * Smart team search — if input is a number, fetch by number first
 * (much faster/more accurate). Falls back to text search.
 */
export async function searchTeamsSmart(query: string): Promise<FTCTeam[]> {
  const num = parseInt(query.trim(), 10);
  if (!isNaN(num) && String(num) === query.trim()) {
    // Exact numeric — try teamByNumber first
    const byNum = await teamByNumber(num);
    if (byNum) return [byNum];
  }
  // Text search (name or partial number)
  return searchTeams(query.trim());
}

/** Text search by team name or number */
export async function searchTeams(query: string): Promise<FTCTeam[]> {
  const data = await gql<{ teamsSearch: FTCTeam[] }>(`
    query($q: String!, $s: Int!) {
      teamsSearch(query: $q, season: $s) {
        number name schoolName city stateProv country
      }
    }
  `, { q: query, s: FTC_SEASON });
  return data.teamsSearch ?? [];
}

/** Look up a single team by number */
export async function teamByNumber(number: number): Promise<FTCTeamDetail | null> {
  const data = await gql<{ teamByNumber: FTCTeamDetail | null }>(`
    query($n: Int!, $s: Int!) {
      teamByNumber(number: $n) {
        number name schoolName city stateProv country
        events(season: $s) {
          event { name code start end }
          ranking { rank wins losses ties }
        }
      }
    }
  `, { n: number, s: FTC_SEASON });
  return data.teamByNumber ?? null;
}

// Alias for backwards compat with season.tsx
export const getTeamDetail = teamByNumber;

/**
 * Get all teams + rankings for an event by event code.
 * Event codes come from FIRST (e.g. USTXHOU, CASC, etc.)
 * Results are sorted by rank ascending (unranked teams last).
 */
export async function getEventRankings(eventCode: string): Promise<FTCEvent | null> {
  const code = eventCode.trim().toUpperCase();
  const data = await gql<{ eventByCode: FTCEvent | null }>(`
    query($s: Int!, $c: String!) {
      eventByCode(season: $s, code: $c) {
        name start end
        teams {
          team { number name }
          ranking { rank wins losses ties rp tbp qualMatchesPlayed }
        }
      }
    }
  `, { s: FTC_SEASON, c: code });
  const ev = data.eventByCode;
  if (!ev) return null;
  // Sort: ranked teams first by rank, then unranked
  return {
    ...ev,
    code,
    teams: [...ev.teams].sort((a, b) => {
      if (!a.ranking && !b.ranking) return 0;
      if (!a.ranking) return 1;
      if (!b.ranking) return -1;
      return a.ranking.rank - b.ranking.rank;
    }),
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function teamLocation(t: FTCTeam): string {
  return [t.city, t.stateProv, t.country].filter(Boolean).join(", ");
}

export function record(r: { wins: number; losses: number; ties: number } | null): string {
  if (!r) return "—";
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}T` : `${r.wins}-${r.losses}`;
}

export function rankLabel(r: FTCEventTeam["ranking"]): string {
  return r ? `#${r.rank}` : "—";
}
