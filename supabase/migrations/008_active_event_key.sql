-- Migration 008: Add active_event_key to organizations
-- Allows orgs to persist their active event key server-side so all
-- devices/users in the org automatically know the current event.

alter table public.organizations
  add column if not exists active_event_key text default null;

comment on column public.organizations.active_event_key is
  'Active FTC event key in format YYYY-EVENTCODE (e.g. 2025-USCAFFFAQ). Set in Settings → Event.';
