/**
 * FTCScout GraphQL API utility
 * Endpoint: https://api.ftcscout.org/graphql
 * Docs: https://ftcscout.org/api
 */

const ENDPOINT = "https://api.ftcscout.org/graphql";
export const CURRENT_SEASON = 2025;

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) {
      console.warn("[FTCScout]", json.errors[0]?.message);
      return null;
    }
    return json.data as T;
  } catch (e) {
    console.error("[FTCScout] fetch error", e);
    return null;
  }
}

export type FTCTeam = {
  number: number;
  name: string;
  schoolName: string | null;
  location: { city: string | null; state: string | null; country: string | null } | null;
};

export type FTCTeamStats = FTCTeam & {
  quickStats: {
    tot: { value: number; rank: number } | null;
    auto: { value: number; rank: number } | null;
    dc:   { value: number; rank: number } | null;
    eg:   { value: number; rank: number } | null;
  } | null;
};

export type FTCEventResult = {
  event: { name: string; code: string; start: string };
  stats: { opr: { value: number } | null; rank: number | null } | null;
  wins: number;
  losses: number;
  ties: number;
};

/** Search teams by number or name */
export async function searchTeams(query: string): Promise<FTCTeam[]> {
  const data = await gql<{ teamsSearch: FTCTeam[] }>(`
    query Search($q: String!) {
      teamsSearch(query: $q, limit: 12) {
        number name schoolName
        location { city state country }
      }
    }
  `, { q: query });
  return data?.teamsSearch ?? [];
}

/** Get detailed stats for a single team */
export async function getTeamStats(number: number, season = CURRENT_SEASON): Promise<FTCTeamStats | null> {
  const data = await gql<{ teamByNumber: FTCTeamStats }>(`
    query TeamStats($num: Int!, $season: Int!) {
      teamByNumber(number: $num) {
        number name schoolName
        location { city state country }
        quickStats(season: $season) {
          tot { value rank }
          auto { value rank }
          dc  { value rank }
          eg  { value rank }
        }
      }
    }
  `, { num: number, season });
  return data?.teamByNumber ?? null;
}

/** Get team event history for a season */
export async function getTeamEvents(number: number, season = CURRENT_SEASON): Promise<FTCEventResult[]> {
  const data = await gql<{ teamByNumber: { events: FTCEventResult[] } }>(`
    query TeamEvents($num: Int!, $season: Int!) {
      teamByNumber(number: $num) {
        events(season: $season) {
          event { name code start }
          stats { opr { value } rank }
          wins losses ties
        }
      }
    }
  `, { num: number, season });
  return data?.teamByNumber?.events ?? [];
}

/** Get teams at a specific event */
export async function getEventTeams(eventCode: string, season = CURRENT_SEASON): Promise<FTCTeamStats[]> {
  const data = await gql<{ eventByCode: { teams: { team: FTCTeamStats; stats: { opr: { value: number } | null; rank: number | null } | null }[] } }>(`
    query EventTeams($code: String!, $season: Int!) {
      eventByCode(code: $code, season: $season) {
        teams {
          team { number name schoolName location { city state country } quickStats(season: $season) { tot { value rank } auto { value rank } dc { value rank } eg { value rank } } }
          stats { opr { value } rank }
        }
      }
    }
  `, { code: eventCode, season });
  return data?.eventByCode?.teams?.map(t => t.team) ?? [];
}
