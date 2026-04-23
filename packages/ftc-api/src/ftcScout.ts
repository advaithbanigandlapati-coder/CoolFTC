/**
 * FTCScout GraphQL client
 * packages/ftc-api/src/ftcScout.ts
 */

const FTCSCOUT_URL = "https://api.ftcscout.org/graphql";

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(FTCSCOUT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 120 }, // Next.js cache: 2 min
  });
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data as T;
}

export async function getEventTeamsFromScout(eventCode: string, season = 2025) {
  const query = `
    query EventTeams($season: Int!, $code: String!) {
      eventByCode(season: $season, code: $code) {
        teams {
          team { number name city stateProv country }
          stats { ... on TeamEventStats2025 {
            opr { totalPointsNp }
            rank rankingPoints wins losses ties highScore
          }}
        }
      }
    }
  `;
  return gql<{ eventByCode: { teams: unknown[] } }>(query, { season, code: eventCode });
}

export async function getTeamSeason(teamNumber: number, season = 2025) {
  const query = `
    query TeamSeason($team: Int!, $season: Int!) {
      teamByNumber(number: $team) {
        name
        events(season: $season) {
          event { name code startDate }
          stats { ... on TeamEventStats2025 {
            rank opr { totalPointsNp } wins losses ties highScore
          }}
        }
      }
    }
  `;
  return gql<{ teamByNumber: unknown }>(query, { team: teamNumber, season });
}
