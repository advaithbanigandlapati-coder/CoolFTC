/**
 * POST /api/org/create
 * Server-side org creation — uses the admin client so it can:
 *   1. Check for duplicate names before inserting
 *   2. Insert into `organizations` without hitting the RETURNING-policy race
 *   3. Confirm the trigger added the user to org_members
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@coolfTC/db";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic  = "force-dynamic";

export async function POST(req: NextRequest) {
  // Authenticate the caller
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, teamNumber } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Org name is required" }, { status: 400 });

  const db = createAdminClient();

  // ── 1. Check that the user doesn't already have an org ──────────
  const { data: existing } = await db
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You are already a member of an organization." },
      { status: 409 }
    );
  }

  // ── 2. Check for duplicate org name (case-insensitive) ──────────
  const { data: nameConflict } = await db
    .from("organizations")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();
  if (nameConflict) {
    return NextResponse.json(
      { error: `An organization named "${name.trim()}" already exists. Please choose a different name.` },
      { status: 409 }
    );
  }

  // ── 3. Create the org (trigger auto-adds creator as admin) ───────
  const slug =
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();

  const { data: org, error: orgErr } = await db
    .from("organizations")
    .insert({
      name: name.trim(),
      ftc_team_number: teamNumber?.trim() || null,
      slug,
      created_by: user.id,
    })
    .select("id,name,ftc_team_number,slug")
    .single();

  if (orgErr || !org) {
    // Postgres unique-index violation = duplicate name race
    if (orgErr?.code === "23505") {
      return NextResponse.json(
        { error: `An organization named "${name.trim()}" already exists.` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: orgErr?.message ?? "Failed to create organization." },
      { status: 500 }
    );
  }

  // ── 4. Confirm membership (trigger should have handled it) ───────
  const { data: member } = await db
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Fallback: trigger might not have fired (local dev without migrations)
  if (!member) {
    await db
      .from("org_members")
      .insert({ org_id: org.id, user_id: user.id, role: "admin" });
  }

  return NextResponse.json({ org });
}
