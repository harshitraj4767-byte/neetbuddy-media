import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const adminSetMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      user_id: z.string().uuid(),
      display_name: z.string().min(1).max(120),
      title: z.string().max(120).nullable().optional(),
      bio: z.string().max(2000).nullable().optional(),
      active: z.boolean().default(true),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    // Verify admin using the user-scoped client (auth.uid()-based).
    const sb: any = context.supabase;
    const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const { data: id, error } = await sb.rpc("admin_set_mentor", {
      _user_id: data.user_id,
      _display_name: data.display_name,
      _title: data.title ?? null,
      _bio: data.bio ?? null,
      _make_active: data.active,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const adminRemoveMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const { error } = await sb.rpc("admin_remove_mentor", { _user_id: data.user_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Mentor assignment (which mentor a student belongs to) --------------
export const adminListMentorsForAssign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const db = await admin();
    const { data, error } = await db
      .from("mentors")
      .select("id, user_id, display_name, title, bio, avatar_url")
      .eq("active", true)
      .order("display_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminAssignMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ user_id: z.string().uuid(), mentor_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { error } = await sb.rpc("admin_assign_mentor", {
      _user_id: data.user_id,
      _mentor_id: data.mentor_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUnassignMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { error } = await sb.rpc("admin_unassign_mentor", { _user_id: data.user_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUserAssignedMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ user_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const db = await admin();
    const { data: row } = await db
      .from("mentor_assignments")
      .select("mentor_id, assigned_at")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!row) return null;
    const { data: m } = await db
      .from("mentors")
      .select("id, display_name, title, avatar_url")
      .eq("id", row.mentor_id)
      .maybeSingle();
    return { assigned_at: row.assigned_at, mentor: m };
  });

// ---- Group renaming (mentor or admin) ------------------------------------
export const renameMentorshipGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ group_id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { error } = await sb.rpc("rename_mentorship_group", {
      _group_id: data.group_id,
      _new_name: data.name,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- List elite-batch students who have no mentor yet --------------------
export const adminListEliteUnassignedStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;
    const { data: ok } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!ok) throw new Error("Forbidden");
    const db = await admin();

    // Find the "elite" batch ids by title (case-insensitive).
    const { data: batches } = await db
      .from("batches")
      .select("id, title")
      .ilike("title", "%elite%");
    const eliteIds = (batches ?? []).map((b: any) => b.id);
    if (!eliteIds.length) return [] as any[];

    const nowISO = new Date().toISOString();
    const { data: subs } = await db
      .from("subscriptions")
      .select("user_id, expires_at")
      .in("source_batch_id", eliteIds)
      .eq("status", "active")
      .gt("expires_at", nowISO);
    const uids: string[] = Array.from(new Set((subs ?? []).map((s: any) => s.user_id)));
    if (!uids.length) return [] as any[];

    const { data: assigned } = await db
      .from("mentor_assignments")
      .select("user_id")
      .in("user_id", uids);
    const assignedSet = new Set((assigned ?? []).map((r: any) => r.user_id));
    const unassigned = uids.filter((u) => !assignedSet.has(u));
    if (!unassigned.length) return [] as any[];

    const { data: profs } = await db
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", unassigned);
    const profBy: Record<string, any> = {};
    for (const p of profs ?? []) profBy[p.id] = p;
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
    const emailBy: Record<string, string> = {};
    for (const u of users?.users ?? []) emailBy[u.id] = u.email ?? "";

    return unassigned.map((uid) => ({
      user_id: uid,
      display_name: profBy[uid]?.display_name ?? null,
      avatar_url: profBy[uid]?.avatar_url ?? null,
      email: emailBy[uid] ?? null,
    }));
  });
