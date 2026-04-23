-- ============================================================
-- CoolFTC Migration 003 — BYOK, Conversation Memory, Pit Scouting, Rivals
-- ============================================================

-- ── BYOK / API Key Storage ────────────────────────────────────────────────────
-- Stores per-org encrypted API keys + trial tracking

alter table public.organizations
  add column if not exists anthropic_key_enc   text,
  add column if not exists openai_key_enc      text,
  add column if not exists api_mode            text not null default 'trial'
    check (api_mode in ('trial','own_key','locked')),
  add column if not exists trial_tokens_used   integer not null default 0,
  add column if not exists trial_started_at    timestamptz default now(),
  add column if not exists trial_expires_at    timestamptz default now() + interval '21 days',
  add column if not exists trial_locked_at     timestamptz;

-- Trial limits
-- 100,000 tokens total over 21 days — enough for ~2 competitions
-- After that: BYOK required

create or replace function public.consume_trial_tokens(
  p_org_id uuid,
  p_tokens  integer
) returns jsonb language plpgsql security definer as $$
declare
  v_org record;
  v_limit integer := 100000;
begin
  select api_mode, trial_tokens_used, trial_expires_at, trial_locked_at
    into v_org from public.organizations where id = p_org_id for update;

  if v_org.api_mode = 'own_key' then
    return jsonb_build_object('allowed', true, 'mode', 'own_key');
  end if;

  if v_org.api_mode = 'locked' then
    return jsonb_build_object('allowed', false, 'reason', 'trial_ended', 'mode', 'locked');
  end if;

  -- Check expiry and limit
  if v_org.trial_expires_at < now() or v_org.trial_tokens_used >= v_limit then
    update public.organizations set api_mode = 'locked', trial_locked_at = now() where id = p_org_id;
    return jsonb_build_object('allowed', false, 'reason',
      case when v_org.trial_expires_at < now() then 'trial_expired' else 'trial_limit_reached' end,
      'mode', 'locked');
  end if;

  update public.organizations
    set trial_tokens_used = trial_tokens_used + p_tokens
  where id = p_org_id;

  return jsonb_build_object(
    'allowed', true,
    'mode', 'trial',
    'tokens_used', v_org.trial_tokens_used + p_tokens,
    'tokens_remaining', v_limit - v_org.trial_tokens_used - p_tokens,
    'expires_at', v_org.trial_expires_at
  );
end;
$$;

-- ── ARIA Conversation Memory ──────────────────────────────────────────────────

create table if not exists public.aria_conversations (
  id           uuid default uuid_generate_v4() primary key,
  org_id       uuid references public.organizations(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  event_key    text not null,
  title        text,
  messages     jsonb not null default '[]',
  summary      text,
  turn_count   integer not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists aria_conversations_org_event
  on public.aria_conversations(org_id, event_key, updated_at desc);

alter table public.aria_conversations enable row level security;

create policy "org members read own conversations"
  on public.aria_conversations for select
  using (auth.uid() = user_id or exists (
    select 1 from public.org_members
    where org_id = aria_conversations.org_id and user_id = auth.uid()
      and role in ('admin','analyst')
  ));

create policy "users manage own conversations"
  on public.aria_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Pit Scouting ──────────────────────────────────────────────────────────────

create table if not exists public.pit_scouting (
  id              uuid default uuid_generate_v4() primary key,
  org_id          uuid references public.organizations(id) on delete cascade,
  event_key       text not null,
  team_number     text not null,
  scouted_by      uuid references public.profiles(id),
  scouted_at      timestamptz default now(),
  drivetrain      text,          -- tank, mecanum, swerve, etc.
  auto_capable    boolean default false,
  endgame_capable text,          -- none, partial, full, both
  mechanical_risk integer check (mechanical_risk between 1 and 5),
  auto_notes      text,
  teleop_notes    text,
  endgame_notes   text,
  general_notes   text,
  photo_urls      text[] default '{}',
  form_data       jsonb not null default '{}',
  unique (org_id, event_key, team_number)
);

create index if not exists pit_scouting_org_event
  on public.pit_scouting(org_id, event_key);

alter table public.pit_scouting enable row level security;

create policy "org members read pit scouting"
  on public.pit_scouting for select
  using (exists (
    select 1 from public.org_members where org_id = pit_scouting.org_id and user_id = auth.uid()
  ));

create policy "scouts write pit scouting"
  on public.pit_scouting for insert
  with check (exists (
    select 1 from public.org_members
    where org_id = pit_scouting.org_id and user_id = auth.uid()
  ));

create policy "scouts update own pit entries"
  on public.pit_scouting for update
  using (scouted_by = auth.uid());

-- ── Rival / Watchlist Enhancements ────────────────────────────────────────────
-- watchlist already exists from migration 001, add cross-event OPR cache

create table if not exists public.team_season_stats (
  team_number   text not null,
  season        text not null,
  event_key     text not null,
  event_name    text,
  opr           numeric,
  rank          integer,
  wins          integer,
  losses        integer,
  fetched_at    timestamptz default now(),
  primary key (team_number, event_key)
);

create index if not exists team_season_stats_number
  on public.team_season_stats(team_number, season);

-- ── ARIA Rate Limits — Add per-request source tracking ───────────────────────
alter table public.aria_rate_limits
  add column if not exists api_mode text default 'trial',
  add column if not exists conversation_id uuid references public.aria_conversations(id);

-- ── Asset Storage for Pit Photos ──────────────────────────────────────────────
-- Storage bucket policies (run via Supabase dashboard Storage tab):
-- Bucket: "pit-photos" — private, max 5MB per file, images only
-- RLS: org members can read files in their org folder (org_id/*)
-- Scouts can upload to their org folder

comment on table public.pit_scouting is
  'Pit scouting entries per team per event. Photo URLs reference Supabase Storage bucket: pit-photos/{org_id}/{event_key}/{team_number}/*';
