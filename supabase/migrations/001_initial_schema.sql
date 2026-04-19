-- ============================================================
-- CoolFTC — Supabase Schema
-- Team #30439 Cool Name Pending | DECODE Season 25-26
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type public.org_role      as enum ('admin', 'scout', 'analyst', 'viewer');
create type public.match_type    as enum ('qual', 'semi', 'final');
create type public.alliance_side as enum ('red', 'blue');
create type public.tier_level    as enum ('OPTIMAL', 'MID', 'BAD');
create type public.asset_type    as enum ('robot_photo', 'pit_photo', 'audio_note', 'strategy_card');
create type public.edition_type  as enum ('quals_recap', 'elim_recap', 'daily', 'robot_spotlight', 'hot_takes');

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================

create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  display_name    text not null,
  avatar_url      text,
  ftc_team_number text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile on Supabase signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ORGANIZATIONS (scouting groups — a team or multi-team alliance)
-- ============================================================

create table public.organizations (
  id              uuid default uuid_generate_v4() primary key,
  name            text not null,
  ftc_team_number text,
  slug            text unique not null,
  logo_url        text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table public.org_members (
  org_id    uuid references public.organizations(id) on delete cascade,
  user_id   uuid references public.profiles(id) on delete cascade,
  role      public.org_role not null default 'scout',
  joined_at timestamptz default now(),
  primary key (org_id, user_id)
);

-- When a user creates an org, auto-add them as admin
create or replace function public.handle_org_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.org_members (org_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.organizations
  for each row execute procedure public.handle_org_created();

-- ============================================================
-- SEASONS
-- ============================================================

create table public.seasons (
  year          integer primary key,
  name          text not null,
  game_manual_url text,
  start_date    date,
  end_date      date
);

-- Seed the current season
insert into public.seasons (year, name)
values (2025, 'DECODE');

-- ============================================================
-- FTC TEAMS (global registry — populated from FTC APIs)
-- ============================================================

create table public.ftc_teams (
  team_number     text primary key,
  team_name       text,
  city            text,
  state_province  text,
  country         text,
  rookie_year     integer,
  website         text,
  last_fetched_at timestamptz
);

-- ============================================================
-- EVENTS (populated from FTC Events API)
-- ============================================================

create table public.events (
  event_key       text primary key,
  season_year     integer references public.seasons(year),
  name            text not null,
  event_type      text, -- 'qualifier', 'championship', 'super_qualifier', 'league_meet'
  city            text,
  state_province  text,
  country         text,
  start_date      date,
  end_date        date,
  remote          boolean default false,
  last_fetched_at timestamptz
);

-- ============================================================
-- TEAM STATS CACHE (OPR, EPA, rankings — per team per event)
-- Refreshed from FTCScout GraphQL + FIRST API after each match
-- ============================================================

create table public.team_stats_cache (
  id           uuid default uuid_generate_v4() primary key,
  event_key    text references public.events(event_key) on delete cascade,
  team_number  text references public.ftc_teams(team_number),
  season_year  integer references public.seasons(year),

  -- Rankings
  rank              integer,
  ranking_score     numeric,
  rp                integer,
  match_points      numeric,
  auto_points       numeric,
  base_points       numeric,
  high_score        integer,
  wins integer default 0,
  losses integer default 0,
  ties integer default 0,
  plays integer default 0,

  -- Calculated stats
  opr         numeric,
  dpr         numeric,
  ccwm        numeric,
  epa         numeric,
  penalty_opr numeric,

  -- Judging
  judging_ap integer,
  total_ap   integer,

  fetched_at timestamptz default now(),
  unique (event_key, team_number)
);

-- ============================================================
-- SCOUTING ENTRIES (pit + team-level scouting, one per team per event per org)
-- form_data is JSONB to support any season's game fields without migrations
-- ============================================================

create table public.scouting_entries (
  id          uuid default uuid_generate_v4() primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  event_key   text references public.events(event_key),
  team_number text references public.ftc_teams(team_number),
  season_year integer references public.seasons(year),

  -- Form data (season-specific fields stored as JSON)
  -- DECODE example keys: hasAuto, autoCloseRange, autoFarRange, ballCapacity,
  -- autoLeave, avgBallsAuto, highBallsAuto, avgBallsTeleop, highBallsTeleop, endgamePlan
  form_data jsonb not null default '{}',

  -- Alliance strategy
  alliance_target boolean default false,
  dnp             boolean default false,
  dnp_reason      text,
  tier            public.tier_level,
  compat_score    numeric,

  -- AI-generated analysis (populated by ARIA on demand)
  -- Keys: notes, complementary, withTips, againstTips, whyAlliance
  ai_analysis     jsonb default '{}',
  ai_analyzed_at  timestamptz,

  -- Metadata
  scouted_by  uuid references public.profiles(id),
  scouted_at  timestamptz default now(),
  updated_at  timestamptz default now(),

  unique (org_id, event_key, team_number)
);

-- ============================================================
-- MATCH SCOUTING (one row per team per match — granular match data)
-- ============================================================

create table public.match_scouting (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  event_key    text references public.events(event_key),
  match_number integer not null,
  match_type   public.match_type not null default 'qual',
  team_number  text references public.ftc_teams(team_number),
  alliance     public.alliance_side,

  -- Season-specific match data
  form_data jsonb not null default '{}',

  -- Computed summaries (derived from form_data, stored for fast querying)
  auto_score    integer default 0,
  teleop_score  integer default 0,
  endgame_score integer default 0,
  total_score   integer default 0,

  scouted_by  uuid references public.profiles(id),
  scouted_at  timestamptz default now(),

  unique (org_id, event_key, match_number, team_number)
);

-- ============================================================
-- NOTES (rich text, audio, per-team or per-match)
-- content stored as Tiptap/ProseMirror JSON
-- ============================================================

create table public.notes (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  event_key    text references public.events(event_key),
  team_number  text references public.ftc_teams(team_number),
  match_number integer,   -- null = team-level note, set = match note
  author_id    uuid references public.profiles(id),
  content      jsonb not null default '{}',
  tags         text[] default '{}',
  audio_url    text,
  is_pinned    boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- WATCHLIST (teams an org is tracking season-wide)
-- ============================================================

create table public.watchlist (
  org_id      uuid references public.organizations(id) on delete cascade,
  team_number text references public.ftc_teams(team_number),
  added_by    uuid references public.profiles(id),
  added_at    timestamptz default now(),
  reason      text,
  primary key (org_id, team_number)
);

-- ============================================================
-- ALLIANCE BOARDS (War Room — drag-and-drop state snapshots)
-- state JSON: { alliances: [{captain, first, second}], dnp: [], priorities: [] }
-- ============================================================

create table public.alliance_boards (
  id         uuid default uuid_generate_v4() primary key,
  org_id     uuid references public.organizations(id) on delete cascade,
  event_key  text references public.events(event_key),
  name       text not null default 'Alliance board',
  state      jsonb not null default '{"alliances":[],"dnp":[],"priorities":[]}',
  is_active  boolean default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- FORGE SIMULATIONS (Monte Carlo results, saved for history + ARIA context)
-- ============================================================

create table public.forge_simulations (
  id             uuid default uuid_generate_v4() primary key,
  org_id         uuid references public.organizations(id) on delete cascade,
  event_key      text references public.events(event_key),
  red_alliance   text[] not null,
  blue_alliance  text[] not null,
  iterations     integer not null default 1000,
  -- results: { redMean, blueMean, redStdDev, blueStdDev, redWinPct,
  --            distribution: [{score, count}], rpProbs: { red: {rp1, rp2}, blue: {} } }
  results        jsonb not null default '{}',
  label          text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz default now()
);

-- ============================================================
-- MEDIA ASSETS (robot photos, pit photos, audio notes)
-- Stored in Supabase Storage bucket "coolfTC-media"
-- ============================================================

create table public.media_assets (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  team_number  text references public.ftc_teams(team_number),
  event_key    text references public.events(event_key),
  season_year  integer references public.seasons(year),
  asset_type   public.asset_type not null,
  storage_path text not null,
  public_url   text,
  caption      text,
  uploaded_by  uuid references public.profiles(id),
  uploaded_at  timestamptz default now()
);

-- ============================================================
-- COURIER EDITIONS (AI-generated newspaper content)
-- content JSON: { sections: [{ type, headline, body, teamRef? }] }
-- ============================================================

create table public.courier_editions (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  event_key    text references public.events(event_key),
  edition_type public.edition_type not null,
  title        text not null,
  content      jsonb not null default '{}',
  pdf_url      text,
  share_slug   text unique,
  published_at timestamptz,
  created_at   timestamptz default now()
);

-- ============================================================
-- ARIA SESSIONS (saved AI context + conversation history)
-- active_modules: which feature contexts are combined (e.g. ['forge','scout','warroom'])
-- context_snapshot: the assembled context block sent to Claude
-- messages: [{role, content, timestamp}]
-- ============================================================

create table public.aria_sessions (
  id               uuid default uuid_generate_v4() primary key,
  org_id           uuid references public.organizations(id) on delete cascade,
  event_key        text references public.events(event_key),
  user_id          uuid references public.profiles(id),
  active_modules   text[] default '{}',
  messages         jsonb not null default '[]',
  context_snapshot jsonb default '{}',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index on public.scouting_entries (org_id, event_key);
create index on public.scouting_entries (team_number);
create index on public.match_scouting   (org_id, event_key);
create index on public.match_scouting   (team_number);
create index on public.team_stats_cache (event_key);
create index on public.team_stats_cache (team_number);
create index on public.notes            (org_id, event_key, team_number);
create index on public.alliance_boards  (org_id, event_key);
create index on public.forge_simulations(org_id, event_key);
create index on public.media_assets     (org_id, team_number);
create index on public.aria_sessions    (org_id, event_key, user_id);
create index on public.courier_editions (org_id, event_key);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: is calling user a member of this org?
create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

-- Helper: is calling user a non-viewer member of this org?
create or replace function public.can_write_org(p_org_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('admin', 'scout', 'analyst')
  );
$$;

-- Helper: is calling user an admin of this org?
create or replace function public.is_org_admin(p_org_id uuid)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- profiles
alter table public.profiles enable row level security;
create policy "profiles_select_all"   on public.profiles for select using (true);
create policy "profiles_insert_own"   on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on public.profiles for update using (auth.uid() = id);

-- organizations
alter table public.organizations enable row level security;
create policy "orgs_select_member"   on public.organizations for select using (public.is_org_member(id));
create policy "orgs_insert_authed"   on public.organizations for insert with check (auth.uid() is not null);
create policy "orgs_update_admin"    on public.organizations for update using (public.is_org_admin(id));
create policy "orgs_delete_admin"    on public.organizations for delete using (public.is_org_admin(id));

-- org_members
alter table public.org_members enable row level security;
create policy "members_select_member" on public.org_members for select using (public.is_org_member(org_id));
create policy "members_insert_admin"  on public.org_members for insert with check (public.is_org_admin(org_id));
create policy "members_update_admin"  on public.org_members for update using (public.is_org_admin(org_id));
create policy "members_delete_admin"  on public.org_members for delete using (public.is_org_admin(org_id));

-- public read-only tables
alter table public.ftc_teams       enable row level security;
alter table public.events          enable row level security;
alter table public.seasons         enable row level security;
alter table public.team_stats_cache enable row level security;
create policy "ftc_teams_select_all"   on public.ftc_teams        for select using (true);
create policy "events_select_all"      on public.events           for select using (true);
create policy "seasons_select_all"     on public.seasons          for select using (true);
create policy "stats_cache_select_all" on public.team_stats_cache for select using (true);

-- scouting_entries
alter table public.scouting_entries enable row level security;
create policy "scout_select"  on public.scouting_entries for select using (public.is_org_member(org_id));
create policy "scout_insert"  on public.scouting_entries for insert with check (public.can_write_org(org_id));
create policy "scout_update"  on public.scouting_entries for update using (public.can_write_org(org_id));
create policy "scout_delete"  on public.scouting_entries for delete using (public.is_org_admin(org_id));

-- match_scouting
alter table public.match_scouting enable row level security;
create policy "match_select"  on public.match_scouting for select using (public.is_org_member(org_id));
create policy "match_insert"  on public.match_scouting for insert with check (public.can_write_org(org_id));
create policy "match_update"  on public.match_scouting for update using (public.can_write_org(org_id));
create policy "match_delete"  on public.match_scouting for delete using (public.is_org_admin(org_id));

-- notes
alter table public.notes enable row level security;
create policy "notes_select"  on public.notes for select using (public.is_org_member(org_id));
create policy "notes_insert"  on public.notes for insert with check (public.can_write_org(org_id));
create policy "notes_update"  on public.notes for update using (public.can_write_org(org_id));
create policy "notes_delete"  on public.notes for delete using (public.is_org_admin(org_id));

-- watchlist
alter table public.watchlist enable row level security;
create policy "watch_select"  on public.watchlist for select using (public.is_org_member(org_id));
create policy "watch_insert"  on public.watchlist for insert with check (public.can_write_org(org_id));
create policy "watch_delete"  on public.watchlist for delete using (public.can_write_org(org_id));

-- alliance_boards
alter table public.alliance_boards enable row level security;
create policy "board_select"  on public.alliance_boards for select using (public.is_org_member(org_id));
create policy "board_insert"  on public.alliance_boards for insert with check (public.can_write_org(org_id));
create policy "board_update"  on public.alliance_boards for update using (public.can_write_org(org_id));
create policy "board_delete"  on public.alliance_boards for delete using (public.is_org_admin(org_id));

-- forge_simulations
alter table public.forge_simulations enable row level security;
create policy "forge_select"  on public.forge_simulations for select using (public.is_org_member(org_id));
create policy "forge_insert"  on public.forge_simulations for insert with check (public.can_write_org(org_id));
create policy "forge_delete"  on public.forge_simulations for delete using (public.is_org_admin(org_id));

-- media_assets
alter table public.media_assets enable row level security;
create policy "media_select"  on public.media_assets for select using (public.is_org_member(org_id));
create policy "media_insert"  on public.media_assets for insert with check (public.can_write_org(org_id));
create policy "media_delete"  on public.media_assets for delete using (public.can_write_org(org_id));

-- courier_editions
alter table public.courier_editions enable row level security;
create policy "courier_select" on public.courier_editions for select using (public.is_org_member(org_id));
create policy "courier_insert" on public.courier_editions for insert with check (public.can_write_org(org_id));
create policy "courier_delete" on public.courier_editions for delete using (public.is_org_admin(org_id));

-- aria_sessions
alter table public.aria_sessions enable row level security;
create policy "aria_select"  on public.aria_sessions for select using (public.is_org_member(org_id));
create policy "aria_insert"  on public.aria_sessions for insert with check (public.can_write_org(org_id));
create policy "aria_update"  on public.aria_sessions for update using (public.can_write_org(org_id));
create policy "aria_delete"  on public.aria_sessions for delete using (public.is_org_admin(org_id));

-- ============================================================
-- REALTIME (enable for live multi-scout collaboration)
-- ============================================================

alter publication supabase_realtime add table public.scouting_entries;
alter publication supabase_realtime add table public.match_scouting;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.alliance_boards;
