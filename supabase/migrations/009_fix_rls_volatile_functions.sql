-- Migration 009: Fix RLS stability bug + creator visibility + org name uniqueness
-- ============================================================
-- PROBLEM: is_org_member / can_write_org / is_org_admin are declared STABLE,
-- which lets PostgreSQL cache their result within a single statement.
-- When handle_org_created() fires (inserting the creator into org_members),
-- PostgREST's subsequent RETURNING check still sees the cached "false" result
-- and raises "new row violates row-level security policy for table organizations".
--
-- FIX 1: Reclassify all three helpers as VOLATILE so their result is never cached.
-- FIX 2: Add an "orgs_select_own" policy so a user can always SELECT the org they
--         just created (belt-and-suspenders, covers any edge case).
-- FIX 3: Add a unique constraint on organizations.name to prevent duplicate orgs.
-- ============================================================

-- Fix helper functions: STABLE → VOLATILE
create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql security definer volatile as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_write_org(p_org_id uuid)
returns boolean language sql security definer volatile as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('admin', 'scout', 'analyst')
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean language sql security definer volatile as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

-- Belt-and-suspenders: let a user always see an org they created
-- (covers the window between INSERT and the trigger completing)
drop policy if exists "orgs_select_own" on public.organizations;
create policy "orgs_select_own"
  on public.organizations for select
  using (auth.uid() = created_by);

-- Prevent duplicate org names (case-insensitive)
-- Using a unique index on lower(name) so "Cool Name Pending" and
-- "cool name pending" are treated as duplicates.
drop index if exists public.organizations_name_lower_unique;
create unique index organizations_name_lower_unique
  on public.organizations (lower(name));
