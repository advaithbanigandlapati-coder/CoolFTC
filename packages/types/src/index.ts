/**
 * CoolFTC — Shared Types
 * packages/types/src/index.ts
 */

// ============================================================
// DB ROW TYPES (mirror schema — generate with `supabase gen types`)
// ============================================================

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  ftc_team_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  ftc_team_number: string | null;
  slug: string;
  logo_url: string | null;
  created_by: string;
  created_at: string;
}

export type OrgRole = "admin" | "scout" | "analyst" | "viewer";

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  joined_at: string;
  profiles?: Profile;
}

export interface FTCTeam {
  team_number: string;
  team_name: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  rookie_year: number | null;
}

export interface Event {
  event_key: string;
  season_year: number;
  name: string;
  event_type: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface TeamStats {
  id: string;
  event_key: string;
  team_number: string;
  rank: number | null;
  ranking_score: number | null;
  rp: number | null;
  match_points: number | null;
  auto_points: number | null;
  base_points: number | null;
  high_score: number | null;
  wins: number;
  losses: number;
  ties: number;
  plays: number;
  opr: number | null;
  dpr: number | null;
  epa: number | null;
  penalty_opr: number | null;
  judging_ap: number | null;
  total_ap: number | null;
  ftc_teams?: FTCTeam;
}

export type TierLevel = "OPTIMAL" | "MID" | "BAD";

export interface ScoutingEntry {
  id: string;
  org_id: string;
  event_key: string;
  team_number: string;
  season_year: number;
  form_data: DecodeFormData; // season-specific — see below
  alliance_target: boolean;
  dnp: boolean;
  dnp_reason: string | null;
  tier: TierLevel | null;
  compat_score: number | null;
  ai_analysis: AIAnalysis;
  ai_analyzed_at: string | null;
  scouted_by: string | null;
  scouted_at: string;
  updated_at: string;
  ftc_teams?: FTCTeam;
}

export interface MatchScoutingEntry {
  id: string;
  org_id: string;
  event_key: string;
  match_number: number;
  match_type: "qual" | "semi" | "final";
  team_number: string;
  alliance: "red" | "blue" | null;
  form_data: DecodeMatchFormData;
  auto_score: number;
  teleop_score: number;
  endgame_score: number;
  total_score: number;
  scouted_by: string | null;
  scouted_at: string;
}

export interface Note {
  id: string;
  org_id: string;
  event_key: string;
  team_number: string | null;
  match_number: number | null;
  author_id: string | null;
  content: Record<string, unknown>; // Tiptap JSON
  tags: string[];
  audio_url: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AllianceBoard {
  id: string;
  org_id: string;
  event_key: string;
  name: string;
  state: AllianceBoardState;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllianceBoardState {
  alliances: AllianceSlot[];
  dnp: DNPEntry[];
  priorities: string[]; // team_numbers in priority order
}

export interface AllianceSlot {
  captain: string | null;
  first: string | null;
  second: string | null;
}

export interface DNPEntry {
  team: string;
  reason?: string;
  addedBy?: string;
}

export interface ForgeSimulation {
  id: string;
  org_id: string;
  event_key: string;
  red_alliance: string[];
  blue_alliance: string[];
  iterations: number;
  results: ForgeResults;
  label: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ForgeResults {
  redMean: number;
  blueMean: number;
  redStdDev: number;
  blueStdDev: number;
  redWinPct: number;
  blueWinPct: number;
  distribution: { score: number; redCount: number; blueCount: number }[];
  rpProbs: {
    red: { movementRp: number; goalRp: number; patternRp: number };
    blue: { movementRp: number; goalRp: number; patternRp: number };
  };
}

// ============================================================
// DECODE SEASON FORM DATA (2025-26)
// ============================================================

export interface DecodeFormData {
  hasAuto: boolean;
  autoCloseRange: boolean;
  autoFarRange: boolean;
  ballCapacity: string;
  autoLeave: boolean;
  avgBallsAuto: number;
  highBallsAuto: number;
  avgBallsTeleop: number;
  highBallsTeleop: number;
  endgamePlan: "none" | "partial" | "full" | "both_bonus";
  scoutNotes: string;
}

export interface DecodeMatchFormData {
  // Auto
  leftStartZone: boolean;
  autoClassified: number;
  autoOverflow: number;
  autoPatternPts: number;
  // Teleop
  teleopClassified: number;
  teleopOverflow: number;
  teleopDepot: number;
  teleopPatternPts: number;
  // Endgame
  baseResult: "none" | "partial" | "full";
  opensGate: boolean;
  // Penalties
  minorPenalties: number;
  majorPenalties: number;
  // Notes
  matchNotes: string;
}

// ============================================================
// AI / ARIA TYPES
// ============================================================

export interface AIAnalysis {
  notes?: string;
  complementary?: string;
  withTips?: string[];
  againstTips?: string[];
  whyAlliance?: string;
}

export type ARIAModuleId =
  | "scout"
  | "stats"
  | "forge"
  | "warroom"
  | "live"
  | "myrobot"
  | "season";

export interface ARIAMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ARIAContext {
  // My team
  myTeamNumber?: string;
  myRobot?: {
    strengths: string;
    weaknesses: string;
    strategy: string;
    opr?: number;
    epa?: number;
    wlt?: string;
  };

  // Event data
  currentEvent?: Event;
  liveEvent?: {
    name: string;
    status: string;
    matchesCompleted: number;
    matchesRemaining: number;
  };
  upcomingMatch?: {
    matchNumber: number;
    matchesAway: number;
    redAlliance: string[];
    blueAlliance: string[];
    mySide: "red" | "blue";
  };

  // Scouting data
  scoutingEntries?: (ScoutingEntry & { ftc_teams?: FTCTeam })[];
  teamStats?: (TeamStats & { ftc_teams?: FTCTeam })[];

  // Strategy tools
  lastSimulation?: ForgeSimulation;
  activeBoard?: AllianceBoard;

  // Season
  seasonStandings?: TeamStats[];
}

export interface ARIAResponse {
  text: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}

// ============================================================
// UI TYPES
// ============================================================

export type AppTab =
  | "home"
  | "scout"
  | "strategy"
  | "data"
  | "aria"
  | "courier";

export interface Toast {
  msg: string;
  type?: "success" | "error" | "info";
}
