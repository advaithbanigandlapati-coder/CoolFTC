-- ============================================================
-- CoolFTC Migration 005 — Awards, Worlds Qualification, Storage, Courier Schedules
-- ============================================================
-- Fills blueprint feature gaps:
--   · awards table for Award tracker (Inspire/Think/Connect/Control, etc.)
--   · qualification_points for Worlds qualification tracker
--   · ranking_snapshots for event ranking trajectory charts
--   · courier_schedules for auto-generating editions on events
--   · Supabase Storage buckets (pit-photos, robot-photos, audio-notes)

-- ────────────────────────────────────────────────────────────
-- AWARDS
-- Tracks Inspire, Think, Connect, Control, Motivate, etc. per team/event
-- ────────────────────────────────────────────────────────────

create type public.award_type as enum (
  'inspire', 'think', 'connect', 'innovate', 'control', 'motivate',
  'design', 'compass', 'promote', 'collins_aerospace_innovate',
  'judges_choice', 'finalist', 'winner'
);

create table if not exists public.awards (
  id            uuid default uuid_generate_v4() primary key,
  event_key     text references public.events(event_key) on delete cascade,
  team_number   text references public.ftc_teams(team_number) on delete cascade,
  season_year   integer not null,
  award_type    public.award_type not null,
  award_name    text not null,          -- human-readable ("Inspire Award — 1st Place")
  placement     integer,                -- 1, 2, 3 (NULL if no placement ranking)
  awarded_at    timestamptz default now(),
  unique (event_key, team_number, award_type, placement)
);

create index if not exists awards_team on public.awards(team_number, season_year);
create index if not exists awards_event on public.awards(event_key);

alter table public.awards enable row level security;
create policy "awards_select_all" on public.awards
  for select using (true);  -- global read; awards are public
create policy "awards_service_write" on public.awards
  for insert with check (auth.role() = 'service_role');
create policy "awards_service_update" on public.awards
  for update using (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- QUALIFICATION POINTS (Worlds Tracker)
-- Tracks each team's path to Worlds via Judging AP + Total AP
-- ────────────────────────────────────────────────────────────

create table if not exists public.qualification_points (
  team_number    text references public.ftc_teams(team_number) on delete cascade,
  season_year    integer not null,
  region         text,                  -- e.g. 'TX', 'CA-N'
  event_key      text references public.events(event_key) on delete cascade,
  judging_ap     numeric default 0,     -- Judging advancement points
  performance_ap numeric default 0,     -- Performance-based AP
  total_ap       numeric generated always as (coalesce(judging_ap,0) + coalesce(performance_ap,0)) stored,
  qualified_to   text,                  -- 'regional', 'state', 'super', 'worlds', or NULL
  qualified_at   timestamptz,
  computed_at    timestamptz default now(),
  primary key (team_number, season_year, event_key)
);

create index if not exists qp_region_season on public.qualification_points(region, season_year);
create index if not exists qp_total_ap on public.qualification_points(season_year, total_ap desc);

alter table public.qualification_points enable row level security;
create policy "qp_select_all" on public.qualification_points
  for select using (true);
create policy "qp_service_write" on public.qualification_points
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Helper: summary for one team across the season
create or replace function public.get_team_qualification_summary(
  p_team_number text,
  p_season_year integer
) returns table (
  team_number text,
  total_ap numeric,
  events_played integer,
  best_event text,
  highest_qualification text
) language sql stable security definer as $$
  select
    p_team_number,
    coalesce(sum(total_ap), 0),
    count(*)::integer,
    (select event_key from public.qualification_points
       where team_number = p_team_number and season_year = p_season_year
       order by total_ap desc nulls last limit 1),
    (select qualified_to from public.qualification_points
       where team_number = p_team_number and season_year = p_season_year
         and qualified_to is not null
       order by
         case qualified_to
           when 'worlds' then 4 when 'super' then 3
           when 'state' then 2  when 'regional' then 1
           else 0 end desc
       limit 1)
  from public.qualification_points
  where team_number = p_team_number and season_year = p_season_year;
$$;

-- ────────────────────────────────────────────────────────────
-- RANKING SNAPSHOTS (per-round rankings for trajectory charts)
-- Captured after each match so analytics can show how rank evolved
-- ────────────────────────────────────────────────────────────

create table if not exists public.ranking_snapshots (
  id            uuid default uuid_generate_v4() primary key,
  event_key     text references public.events(event_key) on delete cascade,
  team_number   text not null,
  after_match   integer not null,       -- rankings after this match number
  rank          integer,
  ranking_score numeric,
  opr           numeric,
  wins          integer,
  losses        integer,
  ties          integer,
  captured_at   timestamptz default now(),
  unique (event_key, team_number, after_match)
);

create index if not exists rs_event_match on public.ranking_snapshots(event_key, after_match);
create index if not exists rs_team on public.ranking_snapshots(team_number, event_key);

alter table public.ranking_snapshots enable row level security;
create policy "rs_select_all" on public.ranking_snapshots for select using (true);
create policy "rs_service_write" on public.ranking_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- COURIER: reconcile schema with app code + edition scheduling
-- The app writes: edition_type, team_number, content (text), generated_at, generated_by
-- Migration 001 had: title (not null), content (jsonb), published_at, created_at
-- Bring the table in line with what the app actually uses.
-- ────────────────────────────────────────────────────────────

-- Make title optional (app doesn't set it) and add the columns the app needs
alter table public.courier_editions
  add column if not exists team_number  text,
  add column if not exists generated_by uuid references public.profiles(id),
  add column if not exists generated_at timestamptz default now();

-- Drop the not-null constraint on title (if it exists)
alter table public.courier_editions alter column title drop not null;

-- App stores markdown text, not JSON. Convert the column type safely.
-- (using the "if the type matches, skip" pattern via a DO block)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'courier_editions'
      and column_name  = 'content'
      and data_type    = 'jsonb'
  ) then
    alter table public.courier_editions
      alter column content type text using content::text,
      alter column content set default '';
  end if;
end $$;

-- Backfill generated_at for any existing rows using created_at
update public.courier_editions
  set generated_at = created_at
  where generated_at is null;

create index if not exists courier_generated_at
  on public.courier_editions(org_id, event_key, generated_at desc);

-- Auto-generation schedules — optional cron-driven edition creation
create table if not exists public.courier_schedules (
  id             uuid default uuid_generate_v4() primary key,
  org_id         uuid references public.organizations(id) on delete cascade,
  event_key      text references public.events(event_key) on delete cascade,
  edition_type   public.edition_type not null,
  cadence        text not null check (cadence in ('once', 'daily', 'after_quals', 'after_elims')),
  next_run_at    timestamptz,
  last_run_at    timestamptz,
  active         boolean default true,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz default now()
);

create index if not exists cs_active_next on public.courier_schedules(next_run_at)
  where active = true;

alter table public.courier_schedules enable row level security;
create policy "cs_org_select" on public.courier_schedules
  for select using (exists (
    select 1 from public.org_members
    where org_id = courier_schedules.org_id and user_id = auth.uid()
  ));
create policy "cs_admin_manage" on public.courier_schedules
  for all using (exists (
    select 1 from public.org_members
    where org_id = courier_schedules.org_id
      and user_id = auth.uid()
      and role = 'admin'
  ));

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKETS (idempotent creation + policies)
-- ────────────────────────────────────────────────────────────

-- pit-photos: per-org pit scouting photos (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pit-photos', 'pit-photos', false,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']::text[]
) on conflict (id) do nothing;

-- robot-photos: per-team public gallery
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'robot-photos', 'robot-photos', true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
) on conflict (id) do nothing;

-- audio-notes: scouting voice notes (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-notes', 'audio-notes', false,
  10485760,  -- 10 MB
  array['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/webm']::text[]
) on conflict (id) do nothing;

-- Drop existing policies so re-running is idempotent
drop policy if exists "pit-photos read"  on storage.objects;
drop policy if exists "pit-photos write" on storage.objects;
drop policy if exists "robot-photos read"  on storage.objects;
drop policy if exists "robot-photos write" on storage.objects;
drop policy if exists "audio-notes read"  on storage.objects;
drop policy if exists "audio-notes write" on storage.objects;

-- pit-photos: org members only. File path convention: {org_id}/{event_key}/{team_number}/{filename}
create policy "pit-photos read" on storage.objects for select using (
  bucket_id = 'pit-photos'
  and exists (
    select 1 from public.org_members
    where user_id = auth.uid()
      and org_id::text = split_part(name, '/', 1)
  )
);
create policy "pit-photos write" on storage.objects for insert with check (
  bucket_id = 'pit-photos'
  and exists (
    select 1 from public.org_members
    where user_id = auth.uid()
      and org_id::text = split_part(name, '/', 1)
  )
);

-- robot-photos: public read, org members write
create policy "robot-photos read" on storage.objects for select using (
  bucket_id = 'robot-photos'
);
create policy "robot-photos write" on storage.objects for insert with check (
  bucket_id = 'robot-photos'
  and auth.uid() is not null
);

-- audio-notes: same org scoping as pit-photos
create policy "audio-notes read" on storage.objects for select using (
  bucket_id = 'audio-notes'
  and exists (
    select 1 from public.org_members
    where user_id = auth.uid()
      and org_id::text = split_part(name, '/', 1)
  )
);
create policy "audio-notes write" on storage.objects for insert with check (
  bucket_id = 'audio-notes'
  and exists (
    select 1 from public.org_members
    where user_id = auth.uid()
      and org_id::text = split_part(name, '/', 1)
  )
);

-- ────────────────────────────────────────────────────────────
-- NOTES: voice + photo attachments metadata
-- ────────────────────────────────────────────────────────────

alter table public.notes
  add column if not exists audio_url  text,
  add column if not exists photo_urls text[] default '{}';

comment on table public.awards is
  'Season-wide awards tracking. Populated by FTC API sync. Public read, service-role write.';

comment on table public.qualification_points is
  'Per-team qualification progress toward higher-level events. Calculated from event results + judging scores.';

comment on table public.ranking_snapshots is
  'Point-in-time rankings captured after each match. Source for analytics ranking trajectory chart.';

comment on table public.courier_schedules is
  'Optional auto-generation schedules for Courier editions. Cron job polls next_run_at ≤ now().';
