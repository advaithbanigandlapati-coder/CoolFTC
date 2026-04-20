-- ============================================================
-- CoolFTC Migration 004 — Analytics Heatmap, Push Tokens, QR Sync
-- ============================================================

-- ── Scoring heatmap: add field position columns to match_scouting ────────────
-- Stores normalized field coordinates (0-1) for where a team scored
-- Used by the analytics heatmap visualisation

alter table public.match_scouting
  add column if not exists field_positions jsonb default '[]',
  -- e.g. [{"x": 0.3, "y": 0.7, "phase": "auto", "pts": 4}, ...]
  add column if not exists scoring_zones  jsonb default '{}';
  -- e.g. {"close": 3, "far": 1, "depot": 0}

-- ── Push notification tokens ─────────────────────────────────────────────────
create table if not exists public.push_tokens (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references public.profiles(id) on delete cascade,
  org_id       uuid references public.organizations(id) on delete cascade,
  token        text not null unique,
  platform     text check (platform in ('ios', 'android', 'web')),
  event_key    text,                     -- only notify for this event
  my_team      text,                     -- notify when this team's match queues
  active       boolean default true,
  registered_at timestamptz default now(),
  last_used_at  timestamptz default now()
);

create index if not exists push_tokens_user   on public.push_tokens(user_id);
create index if not exists push_tokens_event  on public.push_tokens(event_key) where active = true;

alter table public.push_tokens enable row level security;
create policy "users manage own tokens" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── QR sync sessions ─────────────────────────────────────────────────────────
-- Source phone creates a session, target phone scans QR and pulls entries
create table if not exists public.qr_sync_sessions (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  event_key    text not null,
  created_by   uuid references public.profiles(id),
  entry_ids    uuid[] not null,          -- scouting entry IDs in this packet
  entry_count  integer not null default 0,
  scanned_by   uuid references public.profiles(id),
  scanned_at   timestamptz,
  expires_at   timestamptz default now() + interval '10 minutes',
  created_at   timestamptz default now()
);

create index if not exists qr_sync_active on public.qr_sync_sessions(id)
  where scanned_at is null;

alter table public.qr_sync_sessions enable row level security;
create policy "org members use qr sessions" on public.qr_sync_sessions
  for all using (exists (
    select 1 from public.org_members
    where org_id = qr_sync_sessions.org_id and user_id = auth.uid()
  ));

-- ── Alliance compatibility matrix cache ─────────────────────────────────────
-- Pre-computed pairwise scores so the matrix renders fast
create table if not exists public.compat_matrix_cache (
  event_key     text not null,
  org_id        uuid references public.organizations(id) on delete cascade,
  team_a        text not null,
  team_b        text not null,
  compat_score  numeric not null,          -- 0-100
  computed_at   timestamptz default now(),
  primary key (event_key, org_id, team_a, team_b)
);

create index if not exists compat_matrix_event on public.compat_matrix_cache(event_key, org_id);

-- RLS: org members can read their own cache
alter table public.compat_matrix_cache enable row level security;
create policy "org members read compat cache" on public.compat_matrix_cache
  for select using (exists (
    select 1 from public.org_members
    where org_id = compat_matrix_cache.org_id and user_id = auth.uid()
  ));
create policy "service role write compat cache" on public.compat_matrix_cache
  for insert with check (true);
create policy "service role update compat cache" on public.compat_matrix_cache
  for update using (true);

-- ── OPR timeline: already in team_stats_cache + team_season_stats ───────────
-- No new table needed — analytics page queries match-by-match from
-- match_scouting cumulative OPR which is recalculated on sync.
-- Add fetched_at index for efficient time-series queries:
create index if not exists team_stats_cache_event_time
  on public.team_stats_cache(event_key, team_number);

comment on table public.qr_sync_sessions is
  'Short-lived QR code sharing sessions for offline scouting sync between devices.
   Flow: Scout A creates session with their unsynced entries → QR displayed →
   Scout B scans → entries copied to Scout B → session marked scanned.
   Sessions expire after 10 minutes.';
