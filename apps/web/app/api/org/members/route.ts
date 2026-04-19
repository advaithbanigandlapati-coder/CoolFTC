/**
 * CoolFTC — Organization Members API Route
 * apps/web/app/api/org/members/route.ts
 *
 * Admin-only endpoints for managing team membership.
 *
 * GET    /api/org/members?orgId=         → list members with roles
 * POST   /api/org/members                → add existing user by email (they must already have signed up)
 * PATCH  /api/org/members                → change a member's role
 * DELETE /api/org/members?orgId=&userId= → remove a member
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@coolfTC/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrgRole = "admin" | "analyst" | "scout" | "viewer";
const ROLES: OrgRole[] = ["admin", "analyst", "scout", "viewer"];

async function getUser(req: NextRequest) {
  // Try bearer token first (mobile)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const sb = createAdminClient();
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) return user;
    }
  }
  // Fall back to SSR cookies (web)
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function isOrgAdmin(userId: string, orgId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();
  return data?.role === "admin";
}

// ─── GET: list members ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "Missing orgId" }, { status: 400 });

  const db = createAdminClient();
  const { data: member } = await db
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .single();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await db
    .from("org_members")
    .select("user_id, role, joined_at, profiles(display_name, avatar_url, ftc_team_number)")
    .eq("org_id", orgId)
    .order("joined_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

// ─── POST: add a user by email ─────────────────────────────────────────────
// The user must have already signed up — this endpoint adds them to an org.
// Returns a friendly error if they haven't.

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, email, role } = await req.json();
  if (!orgId || !email) return NextResponse.json({ error: "Missing orgId or email" }, { status: 400 });

  const finalRole: OrgRole = ROLES.includes(role) ? role : "scout";

  if (!(await isOrgAdmin(user.id, orgId)))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const db = createAdminClient();

  // Look up user by email via auth admin API
  const { data: authUsers, error: listErr } = await db.auth.admin.listUsers();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const targetUser = authUsers?.users?.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
  if (!targetUser) {
    return NextResponse.json({
      error: "No account found for that email. Ask them to sign up first, then retry.",
    }, { status: 404 });
  }

  // Insert membership (primary key is org_id + user_id, so duplicates are caught)
  const { error: insertErr } = await db
    .from("org_members")
    .insert({ org_id: orgId, user_id: targetUser.id, role: finalRole });

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json({ error: "User is already a member of this org." }, { status: 409 });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    userId: targetUser.id,
    email: targetUser.email,
    role: finalRole,
  });
}

// ─── PATCH: change a member's role ─────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, userId, role } = await req.json();
  if (!orgId || !userId || !role)
    return NextResponse.json({ error: "Missing orgId, userId, or role" }, { status: 400 });
  if (!ROLES.includes(role))
    return NextResponse.json({ error: `Invalid role. Use one of: ${ROLES.join(", ")}` }, { status: 400 });

  if (!(await isOrgAdmin(user.id, orgId)))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  if (userId === user.id && role !== "admin") {
    // Don't let the last admin demote themselves
    const db = createAdminClient();
    const { count } = await db
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't demote the last admin. Promote someone else first." }, { status: 400 });
    }
  }

  const db = createAdminClient();
  const { error } = await db
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// ─── DELETE: remove a member ───────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const userId = req.nextUrl.searchParams.get("userId");
  if (!orgId || !userId) return NextResponse.json({ error: "Missing orgId or userId" }, { status: 400 });

  // Allow users to remove themselves, or admins to remove anyone else
  const selfRemove = userId === user.id;
  if (!selfRemove && !(await isOrgAdmin(user.id, orgId)))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const db = createAdminClient();

  // Block removal of the sole admin
  const { data: target } = await db
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single();

  if (target?.role === "admin") {
    const { count } = await db
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Can't remove the last admin." }, { status: 400 });
    }
  }

  const { error } = await db
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
