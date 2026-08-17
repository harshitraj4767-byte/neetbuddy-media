import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 7): string {
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

const LIVE_WINDOW_SECONDS = 120;

async function assertMember(userId: string, groupId: string) {
  const db = await admin();
  const { data } = await db
    .from("study_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("You are not a member of this group");
  return { role: data.role as string };
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** Seconds studied per user, per day, over the last N days. */
async function sessionStats(groupId: string, days = 30) {
  const db = await admin();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await db
    .from("study_sessions")
    .select("user_id, seconds, started_at, ended_at, last_beat_at")
    .eq("group_id", groupId)
    .gte("started_at", since);
  const byUser: Record<string, { total: number; week: number; today: number; days: Set<string> }> = {};
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const today = new Date().toISOString().slice(0, 10);
  for (const s of data ?? []) {
    const live = !s.ended_at;
    const secs = live
      ? Math.max(0, Math.floor((new Date(s.last_beat_at).getTime() - new Date(s.started_at).getTime()) / 1000))
      : s.seconds ?? 0;
    const bucket = (byUser[s.user_id] ||= { total: 0, week: 0, today: 0, days: new Set() });
    bucket.total += secs;
    const startedMs = new Date(s.started_at).getTime();
    if (startedMs >= weekAgo) bucket.week += secs;
    const dk = dayKey(s.started_at);
    if (dk === today) bucket.today += secs;
    if (secs > 60) bucket.days.add(dk);
  }
  return byUser;
}

function ratingOf(weekSeconds: number, activeDays7: number, completionRate: number) {
  const hours = weekSeconds / 3600;
  const studyScore = Math.min(1, hours / 14) * 40; // 2h/day target
  const consistency = Math.min(1, activeDays7 / 7) * 30;
  const completion = Math.min(1, completionRate) * 30;
  return Math.round(studyScore + consistency + completion);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export const createStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    let code = makeCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await db.from("study_groups").select("id").eq("invite_code", code).maybeSingle();
      if (!clash) break;
      code = makeCode();
    }
    const { data: row, error } = await db
      .from("study_groups")
      .insert({
        name: data.name,
        description: data.description ?? null,
        owner_id: context.userId,
        invite_code: code,
      })
      .select("id, invite_code")
      .single();
    if (error) throw new Error(error.message);
    await db.from("study_group_members").insert({ group_id: row.id, user_id: context.userId, role: "owner" });
    return { id: row.id as string, invite_code: row.invite_code as string };
  });

export const joinStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ code: z.string().trim().min(4).max(16) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const code = data.code.toUpperCase();
    const { data: g } = await db.from("study_groups").select("id, name").eq("invite_code", code).maybeSingle();
    if (!g) throw new Error("Invalid invite code");
    await db
      .from("study_group_members")
      .upsert({ group_id: g.id, user_id: context.userId }, { onConflict: "group_id,user_id" });
    return { id: g.id as string, name: g.name as string };
  });

export const leaveStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ group_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: g } = await db.from("study_groups").select("owner_id").eq("id", data.group_id).maybeSingle();
    if (g?.owner_id === context.userId) throw new Error("Owners cannot leave their own group");
    await db.from("study_group_members").delete().eq("group_id", data.group_id).eq("user_id", context.userId);
    return { ok: true };
  });

export const listMyStudyGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data: memb } = await db
      .from("study_group_members")
      .select("group_id, role")
      .eq("user_id", context.userId);
    const ids = (memb ?? []).map((m: any) => m.group_id);
    if (!ids.length) return { groups: [] as any[] };
    const { data: groups } = await db
      .from("study_groups")
      .select("id, name, description, invite_code, owner_id, created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    const { data: counts } = await db.from("study_group_members").select("group_id, user_id").in("group_id", ids);
    const size: Record<string, number> = {};
    for (const c of counts ?? []) size[c.group_id] = (size[c.group_id] ?? 0) + 1;
    const cutoff = new Date(Date.now() - LIVE_WINDOW_SECONDS * 1000).toISOString();
    const { data: live } = await db
      .from("study_sessions")
      .select("group_id, user_id")
      .in("group_id", ids)
      .is("ended_at", null)
      .gte("last_beat_at", cutoff);
    const liveCount: Record<string, number> = {};
    for (const l of live ?? []) liveCount[l.group_id] = (liveCount[l.group_id] ?? 0) + 1;
    return {
      groups: (groups ?? []).map((g: any) => ({
        ...g,
        member_count: size[g.id] ?? 1,
        live_count: liveCount[g.id] ?? 0,
        is_owner: g.owner_id === context.userId,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Group detail: roster, live presence, tasks, leaderboard
// ---------------------------------------------------------------------------
export const getStudyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ group_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.group_id);
    const db = await admin();

    const { data: g } = await db
      .from("study_groups")
      .select("id, name, description, invite_code, owner_id, created_at")
      .eq("id", data.group_id)
      .maybeSingle();
    if (!g) throw new Error("Group not found");

    const { data: memb } = await db
      .from("study_group_members")
      .select("user_id, role, joined_at")
      .eq("group_id", data.group_id);
    const userIds = (memb ?? []).map((m: any) => m.user_id);
    const { data: profs } = userIds.length
      ? await db.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds)
      : { data: [] as any[] };
    const profBy: Record<string, any> = {};
    for (const p of profs ?? []) profBy[p.id] = p;

    const cutoff = new Date(Date.now() - LIVE_WINDOW_SECONDS * 1000).toISOString();
    const { data: liveRows } = await db
      .from("study_sessions")
      .select("id, user_id, started_at, last_beat_at, mode, label")
      .eq("group_id", data.group_id)
      .is("ended_at", null)
      .gte("last_beat_at", cutoff);
    const liveBy: Record<string, any> = {};
    for (const l of liveRows ?? []) liveBy[l.user_id] = l;

    // Tasks (last 14 days) + completions
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data: tasks } = await db
      .from("study_group_tasks")
      .select("id, title, due_date, created_by, created_at")
      .eq("group_id", data.group_id)
      .gte("due_date", since)
      .order("due_date", { ascending: false });
    const taskIds = (tasks ?? []).map((t: any) => t.id);
    const { data: comps } = taskIds.length
      ? await db.from("study_task_completions").select("task_id, user_id").in("task_id", taskIds)
      : { data: [] as any[] };
    const doneByUser: Record<string, Set<string>> = {};
    for (const c of comps ?? []) (doneByUser[c.user_id] ||= new Set()).add(c.task_id);

    const stats = await sessionStats(data.group_id, 30);
    const totalTasks = taskIds.length;

    const members = (memb ?? []).map((m: any) => {
      const s = stats[m.user_id] ?? { total: 0, week: 0, today: 0, days: new Set<string>() };
      const last7 = new Set(
        Array.from(s.days).filter((d) => new Date(d as string).getTime() >= Date.now() - 7 * 86400000),
      );
      const done = doneByUser[m.user_id]?.size ?? 0;
      const completionRate = totalTasks ? done / totalTasks : 0;
      const rating = ratingOf(s.week, last7.size, completionRate);
      const xp = Math.floor(s.total / 120) + done * 25;
      return {
        user_id: m.user_id,
        role: m.role,
        name:
          profBy[m.user_id]?.full_name ??
          (profBy[m.user_id]?.email ? String(profBy[m.user_id].email).split("@")[0] : null) ??
          "Student",
        avatar_url: profBy[m.user_id]?.avatar_url ?? null,
        today_seconds: s.today,
        week_seconds: s.week,
        total_seconds: s.total,
        active_days_7: last7.size,
        tasks_done: done,
        tasks_total: totalTasks,
        completion_rate: Math.round(completionRate * 100),
        rating,
        xp,
        is_me: m.user_id === context.userId,
        live: liveBy[m.user_id]
          ? { since: liveBy[m.user_id].started_at, label: liveBy[m.user_id].label as string | null }
          : null,
      };
    });
    members.sort((a: any, b: any) => b.rating - a.rating || b.week_seconds - a.week_seconds);

    const myDone = doneByUser[context.userId] ?? new Set<string>();
    return {
      group: { ...g, is_owner: g.owner_id === context.userId },
      members,
      live_count: Object.keys(liveBy).length,
      my_session: liveBy[context.userId]
        ? { id: liveBy[context.userId].id, started_at: liveBy[context.userId].started_at, label: liveBy[context.userId].label }
        : null,
      tasks: (tasks ?? []).map((t: any) => ({ ...t, mine_done: myDone.has(t.id) })),
    };
  });

// ---------------------------------------------------------------------------
// Live study sessions
// ---------------------------------------------------------------------------
export const startStudySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        group_id: z.string().uuid(),
        mode: z.enum(["stopwatch", "timer"]).default("stopwatch"),
        label: z.string().trim().max(80).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.group_id);
    const db = await admin();
    const { data: existing } = await db
      .from("study_sessions")
      .select("id, started_at, label")
      .eq("group_id", data.group_id)
      .eq("user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();
    if (existing) return { id: existing.id, started_at: existing.started_at, label: existing.label };
    const { data: row, error } = await db
      .from("study_sessions")
      .insert({
        group_id: data.group_id,
        user_id: context.userId,
        mode: data.mode,
        label: data.label ?? null,
      })
      .select("id, started_at, label")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, started_at: row.started_at, label: row.label };
  });

export const beatStudySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ session_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db
      .from("study_sessions")
      .update({ last_beat_at: new Date().toISOString() })
      .eq("id", data.session_id)
      .eq("user_id", context.userId)
      .is("ended_at", null);
    return { ok: true };
  });

export const stopStudySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ session_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: s } = await db
      .from("study_sessions")
      .select("id, started_at, ended_at")
      .eq("id", data.session_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!s || s.ended_at) return { ok: true, seconds: 0 };
    const now = new Date();
    const seconds = Math.max(0, Math.floor((now.getTime() - new Date(s.started_at).getTime()) / 1000));
    await db
      .from("study_sessions")
      .update({ ended_at: now.toISOString(), last_beat_at: now.toISOString(), seconds })
      .eq("id", s.id);
    return { ok: true, seconds };
  });

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const createGroupTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        group_id: z.string().uuid(),
        title: z.string().trim().min(2).max(160),
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.group_id);
    const db = await admin();
    const { data: row, error } = await db
      .from("study_group_tasks")
      .insert({
        group_id: data.group_id,
        created_by: context.userId,
        title: data.title,
        due_date: data.due_date ?? new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteGroupTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ task_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: t } = await db
      .from("study_group_tasks")
      .select("id, group_id, created_by")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!t) throw new Error("Task not found");
    const { data: g } = await db.from("study_groups").select("owner_id").eq("id", t.group_id).maybeSingle();
    if (t.created_by !== context.userId && g?.owner_id !== context.userId) throw new Error("Forbidden");
    await db.from("study_group_tasks").delete().eq("id", data.task_id);
    return { ok: true };
  });

export const toggleGroupTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ task_id: z.string().uuid(), done: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: t } = await db.from("study_group_tasks").select("group_id").eq("id", data.task_id).maybeSingle();
    if (!t) throw new Error("Task not found");
    await assertMember(context.userId, t.group_id);
    if (data.done) {
      const { error } = await db
        .from("study_task_completions")
        .upsert({ task_id: data.task_id, user_id: context.userId }, { onConflict: "task_id,user_id" });
      if (error) throw new Error(error.message);
    } else {
      await db.from("study_task_completions").delete().eq("task_id", data.task_id).eq("user_id", context.userId);
    }
    return { ok: true };
  });
