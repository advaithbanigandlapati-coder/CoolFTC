-- ============================================================
-- Migration 007: pg_cron schedules — replaces Vercel Cron
-- ============================================================
--
-- This migration sets up Supabase's built-in cron scheduler to call your
-- Vercel cron endpoints. Free, reliable, runs every minute.
--
-- BEFORE RUNNING THIS MIGRATION, you must:
--   1. Set two database secrets so the SQL can find your endpoints:
--      Supabase Dashboard → Project Settings → Database → "Database Secrets"
--      (or via SQL):
--          select vault.create_secret('https://YOUR-VERCEL-URL.vercel.app', 'site_url');
--          select vault.create_secret('YOUR_CRON_SECRET_HERE', 'cron_secret');
--
--   2. Enable the pg_cron and pg_net extensions:
--      Supabase Dashboard → Database → Extensions → enable pg_cron, pg_net
--      (or run the CREATE EXTENSION lines below — they're idempotent)
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: pull the secrets at call time (so updating them takes effect immediately).
create or replace function public._cron_site_url() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'site_url' limit 1
$$;

create or replace function public._cron_secret() returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1
$$;

-- Helper: invoke a cron endpoint via pg_net.
create or replace function public._invoke_cron(path text) returns bigint
language plpgsql security definer set search_path = public, net as $$
declare
  url text := public._cron_site_url() || path;
  secret text := public._cron_secret();
  request_id bigint;
begin
  select net.http_get(
    url := url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret)
  ) into request_id;
  return request_id;
end;
$$;

-- Remove any prior schedules with the same names (idempotent re-run)
do $$
begin
  perform cron.unschedule(jobname) from cron.job
   where jobname in ('coolftc-ftc-refresh', 'coolftc-match-notify', 'coolftc-courier-schedules');
exception when others then null;
end $$;

-- Schedule the three jobs:
--   ftc-refresh:      every 2 min — refresh FTC rankings cache
--   match-notify:     every 1 min — push notifications when matches are on deck
--   courier-schedules:every 15 min — auto-generate scheduled Courier editions
select cron.schedule(
  'coolftc-ftc-refresh',
  '*/2 * * * *',
  $$select public._invoke_cron('/api/cron/ftc-refresh')$$
);

select cron.schedule(
  'coolftc-match-notify',
  '*/1 * * * *',
  $$select public._invoke_cron('/api/cron/match-notify')$$
);

select cron.schedule(
  'coolftc-courier-schedules',
  '*/15 * * * *',
  $$select public._invoke_cron('/api/cron/courier-schedules')$$
);

-- View your scheduled jobs anytime:
--   select * from cron.job;
--
-- View execution history:
--   select * from cron.job_run_details order by start_time desc limit 50;
--
-- Disable a job temporarily:
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'coolftc-ftc-refresh'), active := false);
