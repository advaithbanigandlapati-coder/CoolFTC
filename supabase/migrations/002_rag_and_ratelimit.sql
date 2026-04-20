-- ============================================================
-- CoolFTC — Migration 002: RAG embeddings + ARIA rate limiting
-- Run after 001_initial_schema.sql
-- ============================================================

-- Enable pgvector extension (built into Supabase)
create extension if not exists vector;

-- ============================================================
-- SCOUTING EMBEDDINGS
-- One row per scouting_entry — stores the vector embedding of
-- the assembled text representation so ARIA can retrieve only
-- the most relevant teams for a given query.
-- ============================================================

create table public.scouting_embeddings (
  id              uuid default uuid_generate_v4() primary key,
  scouting_entry_id uuid references public.scouting_entries(id) on delete cascade unique,
  org_id          uuid references public.organizations(id) on delete cascade,
  event_key       text references public.events(event_key),
  team_number     text references public.ftc_teams(team_number),

  -- The text that was embedded (for debugging / re-indexing)
  embedded_text   text not null,

  -- The embedding vector (text-embedding-3-small: 1536 dims)
  embedding       vector(1536),

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on public.scouting_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index on public.scouting_embeddings (org_id, event_key);

-- RLS
alter table public.scouting_embeddings enable row level security;
create policy "embed_select" on public.scouting_embeddings for select using (public.is_org_member(org_id));
create policy "embed_insert" on public.scouting_embeddings for insert with check (public.can_write_org(org_id));
create policy "embed_update" on public.scouting_embeddings for update using (public.can_write_org(org_id));
create policy "embed_delete" on public.scouting_embeddings for delete using (public.can_write_org(org_id));

-- ============================================================
-- MATCH SCOUTING EMBEDDINGS (per-match notes + performance)
-- ============================================================

create table public.match_embeddings (
  id              uuid default uuid_generate_v4() primary key,
  match_scouting_id uuid references public.match_scouting(id) on delete cascade unique,
  org_id          uuid references public.organizations(id) on delete cascade,
  event_key       text references public.events(event_key),
  team_number     text,
  embedded_text   text not null,
  embedding       vector(1536),
  created_at      timestamptz default now()
);

create index on public.match_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index on public.match_embeddings (org_id, event_key);

alter table public.match_embeddings enable row level security;
create policy "membed_select" on public.match_embeddings for select using (public.is_org_member(org_id));
create policy "membed_insert" on public.match_embeddings for insert with check (public.can_write_org(org_id));
create policy "membed_delete" on public.match_embeddings for delete using (public.can_write_org(org_id));

-- ============================================================
-- ARIA RATE LIMITING
-- Tracks token usage per org in a 5-hour rolling window.
-- Checked before every ARIA call; updated after each response.
-- ============================================================

create table public.aria_rate_limits (
  id          uuid default uuid_generate_v4() primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  tokens_used integer not null default 0,
  window_start timestamptz not null default now(),
  created_at  timestamptz default now()
);

create index on public.aria_rate_limits (org_id, window_start);
create index on public.aria_rate_limits (user_id, window_start);

alter table public.aria_rate_limits enable row level security;
create policy "ratelimit_select" on public.aria_rate_limits for select using (public.is_org_member(org_id));
create policy "ratelimit_insert" on public.aria_rate_limits for insert with check (public.can_write_org(org_id));
create policy "ratelimit_update" on public.aria_rate_limits for update using (public.can_write_org(org_id));

-- ============================================================
-- HELPER: get token usage for an org in the last 5 hours
-- ============================================================

create or replace function public.get_aria_usage(p_org_id uuid, p_window_hours integer default 5)
returns table(tokens_used bigint, request_count bigint) language sql stable security definer as $$
  select
    coalesce(sum(tokens_used), 0) as tokens_used,
    count(*) as request_count
  from public.aria_rate_limits
  where org_id = p_org_id
    and window_start > now() - (p_window_hours || ' hours')::interval;
$$;

-- Clean up old rate limit records (> 24h) via pg_cron if available,
-- or call this manually / from a cron job
create or replace function public.cleanup_aria_rate_limits()
returns void language sql security definer as $$
  delete from public.aria_rate_limits
  where window_start < now() - interval '24 hours';
$$;

-- ============================================================
-- VECTOR SIMILARITY SEARCH FUNCTION
-- Returns the top-k most relevant scouting entries for a query
-- ============================================================

create or replace function public.match_scouting_entries(
  query_embedding  vector(1536),
  p_org_id         uuid,
  p_event_key      text,
  match_count      integer default 8,
  similarity_threshold float default 0.3
)
returns table (
  scouting_entry_id uuid,
  team_number       text,
  embedded_text     text,
  similarity        float
) language sql stable as $$
  select
    se.scouting_entry_id,
    se.team_number,
    se.embedded_text,
    1 - (se.embedding <=> query_embedding) as similarity
  from public.scouting_embeddings se
  where se.org_id = p_org_id
    and se.event_key = p_event_key
    and 1 - (se.embedding <=> query_embedding) > similarity_threshold
  order by se.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- MATCH ENTRY SIMILARITY SEARCH
-- ============================================================

create or replace function public.match_match_entries(
  query_embedding  vector(1536),
  p_org_id         uuid,
  p_event_key      text,
  match_count      integer default 6,
  similarity_threshold float default 0.25
)
returns table (
  match_scouting_id uuid,
  team_number       text,
  embedded_text     text,
  similarity        float
) language sql stable as $$
  select
    me.match_scouting_id,
    me.team_number,
    me.embedded_text,
    1 - (me.embedding <=> query_embedding) as similarity
  from public.match_embeddings me
  where me.org_id = p_org_id
    and me.event_key = p_event_key
    and 1 - (me.embedding <=> query_embedding) > similarity_threshold
  order by me.embedding <=> query_embedding
  limit match_count;
$$;
