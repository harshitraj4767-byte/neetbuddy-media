import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function isAdmin(userId: string): Promise<boolean> {
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function myMentorId(userId: string): Promise<string | null> {
  const db = await admin();
  const { data } = await db
    .from("mentors")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  return data?.id ?? null;
}

/** All user_ids under any group I mentor (or all users, if admin). */
async function menteeIdsForMentor(userId: string): Promise<{ ids: string[]; groups: any[]; mentorId: string | null }> {
  const db = await admin();
  const adminFlag = await isAdmin(userId);
  const mid = await myMentorId(userId);

  let groups: any[] = [];
  if (adminFlag) {
    const { data } = await db.from("mentorship_groups").select("id, name, mentor_id");
    groups = data ?? [];
  } else if (mid) {
    const { data } = await db.from("mentorship_groups").select("id, name, mentor_id").eq("mentor_id", mid);
    groups = data ?? [];
  } else {
    return { ids: [], groups: [], mentorId: null };
  }
  const gids = groups.map((g) => g.id);
  if (!gids.length) return { ids: [], groups, mentorId: mid };
  const { data: mems } = await db
    .from("mentorship_group_members")
    .select("user_id, group_id")
    .in("group_id", gids);
  const ids: string[] = Array.from(new Set((mems ?? []).map((m: any) => m.user_id as string)));
  return { ids, groups, mentorId: mid };
}

/** Assert current user can view a target user's data. */
async function assertMentorCanView(userId: string, targetUserId: string) {
  if (userId === targetUserId) return;
  if (await isAdmin(userId)) return;
  const { ids } = await menteeIdsForMentor(userId);
  if (!ids.includes(targetUserId)) throw new Error("Forbidden");
}

/** Find user by email (only if they are a mentee of the current mentor). */
export const mentorLookupUserByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ email: z.string().trim().email() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const adminFlag = await isAdmin(context.userId);
    const { ids } = await menteeIdsForMentor(context.userId);
    const { data: u } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
    const target = (u?.users ?? []).find((x: any) => (x.email ?? "").toLowerCase() === data.email.toLowerCase());
    if (!target) throw new Error("No user with that email");
    if (!adminFlag && !ids.includes(target.id)) {
      throw new Error("This user is not in any of your mentorship groups");
    }
    return { user_id: target.id, email: target.email };
  });

/** Detailed report for one user (must be a mentee of the requester). */
export const getUserReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ user_id: z.string().uuid(), days: z.number().int().min(1).max(60).default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertMentorCanView(context.userId, data.user_id);
    const db = await admin();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - data.days);
    const sinceISO = since.toISOString().slice(0, 10);

    const { data: profile } = await db
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", data.user_id)
      .maybeSingle();
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
    const u = (users?.users ?? []).find((x: any) => x.id === data.user_id);

    const { data: cls } = await db
      .from("daily_checklist")
      .select("id, date, morning_submitted_at, night_submitted_at, good_things, regrets")
      .eq("user_id", data.user_id)
      .gte("date", sinceISO)
      .order("date", { ascending: false });
    const ids = (cls ?? []).map((r: any) => r.id);
    const { data: items } = ids.length
      ? await db.from("daily_checklist_items").select("id, checklist_id, text, done, order_idx").in("checklist_id", ids).order("order_idx")
      : { data: [] as any[] };
    const byCl: Record<string, any[]> = {};
    for (const it of items ?? []) (byCl[it.checklist_id] ||= []).push(it);
    const days = (cls ?? []).map((r: any) => {
      const its = byCl[r.id] ?? [];
      const total = its.length;
      const done = its.filter((i: any) => i.done).length;
      return { ...r, items: its, total, done, completion: total ? done / total : 0 };
    });

    // Weekly targets progress across groups the user belongs to
    const { data: memb } = await db
      .from("mentorship_group_members")
      .select("group_id")
      .eq("user_id", data.user_id);
    const gids = (memb ?? []).map((m: any) => m.group_id);
    const { data: tgts } = gids.length
      ? await db.from("weekly_targets").select("id, group_id, week_start, title").in("group_id", gids).order("week_start", { ascending: false }).limit(20)
      : { data: [] as any[] };
    const tids = (tgts ?? []).map((t: any) => t.id);
    const { data: titems } = tids.length
      ? await db.from("weekly_target_items").select("id, target_id, text").in("target_id", tids)
      : { data: [] as any[] };
    const titemIds = (titems ?? []).map((i: any) => i.id);
    const { data: tprog } = titemIds.length
      ? await db.from("weekly_target_progress").select("target_item_id").in("target_item_id", titemIds).eq("user_id", data.user_id).eq("done", true)
      : { data: [] as any[] };
    const doneSet = new Set((tprog ?? []).map((p: any) => p.target_item_id));
    const itemsByTarget: Record<string, any[]> = {};
    for (const it of titems ?? []) {
      (itemsByTarget[it.target_id] ||= []).push({ ...it, done: doneSet.has(it.id) });
    }
    const targets = (tgts ?? []).map((t: any) => {
      const its = itemsByTarget[t.id] ?? [];
      const done = its.filter((i: any) => i.done).length;
      return { ...t, items: its, total: its.length, done, completion: its.length ? done / its.length : 0 };
    });

    const streak = (() => {
      let s = 0;
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        const row = days.find((x: any) => x.date === key);
        if (row && row.night_submitted_at) s++;
        else break;
      }
      return s;
    })();

    return {
      user: {
        id: data.user_id,
        email: u?.email ?? null,
        display_name: profile?.display_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      streak,
      days,
      targets,
    };
  });

/** Combined data for every mentee of the current mentor (leaderboard-style). */
export const getMenteesOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ days: z.number().int().min(1).max(30).default(7) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { ids, groups } = await menteeIdsForMentor(context.userId);
    if (!ids.length) return { mentees: [] as any[], groups };
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - data.days);
    const sinceISO = since.toISOString().slice(0, 10);

    const { data: profs } = await db
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 500 });
    const emailById: Record<string, string> = {};
    for (const u of users?.users ?? []) emailById[u.id] = u.email ?? "";

    const { data: cls } = await db
      .from("daily_checklist")
      .select("id, user_id, date, morning_submitted_at, night_submitted_at, good_things, regrets")
      .in("user_id", ids)
      .gte("date", sinceISO);
    const clIds = (cls ?? []).map((c: any) => c.id);
    const { data: items } = clIds.length
      ? await db.from("daily_checklist_items").select("checklist_id, done").in("checklist_id", clIds)
      : { data: [] as any[] };
    const itemsByCl: Record<string, { total: number; done: number }> = {};
    for (const it of items ?? []) {
      const s = (itemsByCl[it.checklist_id] ||= { total: 0, done: 0 });
      s.total += 1;
      if (it.done) s.done += 1;
    }

    const perUser: Record<string, { submissions: number; completion: number; last: string | null; regrets: number; good: number }> = {};
    for (const uid of ids) perUser[uid] = { submissions: 0, completion: 0, last: null, regrets: 0, good: 0 };
    const compAccum: Record<string, { total: number; done: number }> = {};
    for (const c of cls ?? []) {
      const s = perUser[c.user_id];
      if (c.night_submitted_at) s.submissions += 1;
      if (c.good_things?.trim()) s.good += 1;
      if (c.regrets?.trim()) s.regrets += 1;
      if (!s.last || c.date > s.last) s.last = c.date;
      const it = itemsByCl[c.id] ?? { total: 0, done: 0 };
      const acc = (compAccum[c.user_id] ||= { total: 0, done: 0 });
      acc.total += it.total;
      acc.done += it.done;
    }
    for (const uid of ids) {
      const acc = compAccum[uid] ?? { total: 0, done: 0 };
      perUser[uid].completion = acc.total ? acc.done / acc.total : 0;
    }

    const profBy: Record<string, any> = {};
    for (const p of profs ?? []) profBy[p.id] = p;

    return {
      groups,
      mentees: ids.map((uid) => ({
        user_id: uid,
        email: emailById[uid] ?? null,
        display_name: profBy[uid]?.display_name ?? null,
        avatar_url: profBy[uid]?.avatar_url ?? null,
        ...perUser[uid],
      })).sort((a, b) => (b.submissions - a.submissions) || (b.completion - a.completion)),
    };
  });
