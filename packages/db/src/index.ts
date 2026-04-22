export * from "./client";
export * from "./queries/scouting";
export * from "./queries/matchScouting";
export * from "./queries/allianceBoard";
export * from "./queries/forge";
export * from "./queries/teams";
export * from "./queries/events";
export * from "./queries/notes";
export * from "./offline/queue";
export * from "./offline/sync";
// Realtime hooks intentionally NOT re-exported here — they use React hooks
// and would poison server-bundled API routes. Import directly from
// "@coolfTC/db/realtime/useAllianceSync" etc. in client components only.
