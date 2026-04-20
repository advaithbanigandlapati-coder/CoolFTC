-- ============================================================
-- Migration 006: Real heatmap + honest schema cleanup + cron support
-- ============================================================

-- Add field_positions jsonb for tap-coordinate heatmaps
-- Structure: [{x: 0.0-1.0, y: 0.0-1.0, phase: "auto"|"teleop"|"endgame"}]
alter table public.scouting_entries
  add column if not exists field_positions jsonb default '[]';

-- Match-level field positions (per-match so we can see evolution)
alter table public.match_scouting
  add column if not exists field_positions jsonb default '[]';

-- Remove driver_skill column if it exists (scrapped per product decision)
alter table public.scouting_entries
  drop column if exists driver_skill;
alter table public.match_scouting
  drop column if exists driver_skill;

comment on column public.scouting_entries.field_positions is
  'Array of {x,y,phase} tap coordinates (0-1 normalized). Populated from mobile scout form field heatmap taps.';
comment on column public.match_scouting.field_positions is
  'Per-match tap positions. Aggregated into team-level heatmap via scouting_entries.';

-- ── Push notification dedup ─────────────────────────────────────────────────
-- Prevents duplicate match alerts when cron runs every minute.
create table if not exists public.push_notifications_sent (
  dedupe_key text primary key,
  sent_at    timestamptz default now()
);

-- TTL cleanup — drop dedup records older than 7 days (run this periodically)
create index if not exists push_notif_sent_at on public.push_notifications_sent(sent_at);

-- No RLS — cron writes via service role only.
-- Optional cleanup (run monthly via SQL or manually):
--   delete from public.push_notifications_sent where sent_at < now() - interval '7 days';

-- ── Courier schedule columns ────────────────────────────────────────────────
-- Make sure courier_schedules has the columns our cron expects.
alter table public.courier_schedules
  add column if not exists next_run_at timestamptz default now(),
  add column if not exists last_run_at timestamptz,
  add column if not exists cadence text default 'daily',
  add column if not exists active boolean default true;
create index if not exists courier_sched_next_run on public.courier_schedules(next_run_at) where active = true;
