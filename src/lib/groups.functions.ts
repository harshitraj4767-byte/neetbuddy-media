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

/** Return the mentor role/id for a user, if any. */
export const getMentorContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [adminFlag, mid] = await Promise.all([isAdmin(context.userId), myMentorId(context.userId)]);
    return { isAdmin: adminFlag, isMentor: !!mid, mentorId: mid };
  });

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export const adminCreateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).optional().nullable(),
      mentor_id: z.string().uuid().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { data: row, error } = await db
      .from("mentorship_groups")
      .insert({
        name: data.name,
        description: data.description ?? null,
        mentor_id: data.mentor_id ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminAssignMentorToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      group_id: z.string().uuid(),
      mentor_id: z.string().uuid().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { error } = await db
      .from("mentorship_groups")
      .update({ mentor_id: data.mentor_id })
      .eq("id", data.group_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminAddGroupMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ group_id: z.string().uuid(), email: z.string().trim().email() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { data: u, error: uerr } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (uerr) throw new Error(uerr.message);
    const found = (u?.users ?? []).find((x: any) => (x.email ?? "").toLowerCase() === data.email.toLowerCase());
    if (!found) throw new Error("No user with that email");
    const { error } = await db
      .from("mentorship_group_members")
      .upsert({ group_id: data.group_id, user_id: found.id });
    if (error) throw new Error(error.message);
    return { ok: true, user_id: found.id };
  });

export const adminRemoveGroupMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ group_id: z.string().uuid(), user_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { error } = await db
      .from("mentorship_group_members")
      .delete()
      .eq("group_id", data.group_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { data: groups } = await db
      .from("mentorship_groups")
      .select("id, name, description, mentor_id, created_at")
      .order("created_at", { ascending: false });
    const ids = (groups ?? []).map((g: any) => g.id);
    const { data: members } = ids.length
      ? await db.from("mentorship_group_members").select("group_id, user_id").in("group_id", ids)
      : { data: [] as any[] };
    const byGroup: Record<string, string[]> = {};
    for (const m of members ?? []) (byGroup[m.group_id] ||= []).push(m.user_id);
    return { groups: (groups ?? []).map((g: any) => ({ ...g, member_ids: byGroup[g.id] ?? [] })) };
  });

export const adminListMentors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Forbidden");
    const db = await admin();
    const { data } = await db
      .from("mentors")
      .select("id, user_id, display_name, title, active")
      .order("display_name", { ascending: true });
    return { mentors: data ?? [] };
  });

/** Groups the current user has access to (member OR assigned mentor OR admin). */
export const listMyGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const [adminFlag, mid] = await Promise.all([isAdmin(context.userId), myMentorId(context.userId)]);

    let query = db.from("mentorship_groups").select("id, name, description, mentor_id, created_at");
    if (adminFlag) {
      // all
    } else {
      const orClauses: string[] = [];
      if (mid) orClauses.push(`mentor_id.eq.${mid}`);
      // membership
      const { data: memb } = await db
        .from("mentorship_group_members")
        .select("group_id")
        .eq("user_id", context.userId);
      const gids = (memb ?? []).map((r: any) => r.group_id);
      if (gids.length) orClauses.push(`id.in.(${gids.join(",")})`);
      if (!orClauses.length) return { groups: [] as any[], role: mid ? "mentor" : "student" };
      query = query.or(orClauses.join(","));
    }
    const { data: groups } = await query.order("created_at", { ascending: false });
    return {
      groups: groups ?? [],
      role: adminFlag ? "admin" : mid ? "mentor" : "student",
    };
  });

export const getGroupDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ group_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const [adminFlag, mid] = await Promise.all([isAdmin(context.userId), myMentorId(context.userId)]);
    const { data: g } = await db
      .from("mentorship_groups")
      .select("id, name, description, mentor_id, created_at")
      .eq("id", data.group_id)
      .maybeSingle();
    if (!g) throw new Error("Group not found");

    const { data: memb } = await db
      .from("mentorship_group_members")
      .select("user_id, joined_at")
      .eq("group_id", data.group_id);
    const memberIds = (memb ?? []).map((r: any) => r.user_id);

    const isMember = memberIds.includes(context.userId);
    const isGroupMentor = !!mid && g.mentor_id === mid;
    if (!(adminFlag || isMember || isGroupMentor)) throw new Error("Forbidden");

    // Fetch profile info
    const { data: profs } = memberIds.length
      ? await db.from("profiles").select("id, display_name, avatar_url").in("id", memberIds)
      : { data: [] as any[] };
    const profById: Record<string, any> = {};
    for (const p of profs ?? []) profById[p.id] = p;

    // Fetch emails for mentor via auth
    let members: Array<{ user_id: string; display_name: string | null; avatar_url: string | null; email: string | null }> = [];
    if (memberIds.length) {
      const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      const emailById: Record<string, string> = {};
      for (const u of users?.users ?? []) emailById[u.id] = u.email ?? "";
      members = memberIds.map((uid: string) => ({
        user_id: uid,
        display_name: profById[uid]?.display_name ?? null,
        avatar_url: profById[uid]?.avatar_url ?? null,
        email: emailById[uid] ?? null,
      }));
    }

    // Mentor info
    let mentor: any = null;
    if (g.mentor_id) {
      const { data: m } = await db
        .from("mentors")
        .select("id, user_id, display_name, title, bio, avatar_url")
        .eq("id", g.mentor_id)
        .maybeSingle();
      mentor = m ?? null;
      if (mentor) {
        const { data: ratings } = await db
          .from("mentor_ratings")
          .select("rating, user_id")
          .eq("mentor_id", mentor.id);
        const list = ratings ?? [];
        const count = list.length;
        const avg = count ? Math.round((list.reduce((s: number, r: any) => s + r.rating, 0) / count) * 10) / 10 : 0;
        const mine = list.find((r: any) => r.user_id === context.userId)?.rating ?? null;
        mentor = { ...mentor, rating_avg: avg, rating_count: count, my_rating: mine };
      }
    }

    return {
      group: g,
      mentor,
      members,
      viewer: {
        isAdmin: adminFlag,
        isGroupMentor,
        isMember,
        canModerate: adminFlag || isGroupMentor,
      },
    };
  });

// ---------------------------------------------------------------------------
// Group chat messages
// ---------------------------------------------------------------------------
async function assertGroupMember(userId: string, groupId: string): Promise<{ canModerate: boolean }> {
  const db = await admin();
  const [adminFlag, mid] = await Promise.all([isAdmin(userId), myMentorId(userId)]);
  if (adminFlag) return { canModerate: true };
  const { data: g } = await db
    .from("mentorship_groups")
    .select("mentor_id")
    .eq("id", groupId)
    .maybeSingle();
  if (mid && g?.mentor_id === mid) return { canModerate: true };
  const { data: m } = await db
    .from("mentorship_group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) throw new Error("Forbidden");
  return { canModerate: false };
}

export const listGroupMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ group_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertGroupMember(context.userId, data.group_id);
    const db = await admin();
    const { data: msgs } = await db
      .from("group_messages")
      .select("id, user_id, body, attachment_url, attachment_type, reply_to, pinned, deleted, created_at, kind, poll_question, poll_options")
      .eq("group_id", data.group_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const list = (msgs ?? []).reverse();
    const uids = Array.from(new Set(list.map((m: any) => m.user_id)));
    const pollIds = list.filter((m: any) => m.kind === "poll").map((m: any) => m.id);
    const [{ data: profs }, { data: roles }, { data: mentorsRows }, { data: votes }] = await Promise.all([
      uids.length ? db.from("profiles").select("id, display_name, avatar_url").in("id", uids) : Promise.resolve({ data: [] as any[] }),
      uids.length ? db.from("user_roles").select("user_id, role").in("user_id", uids) : Promise.resolve({ data: [] as any[] }),
      uids.length ? db.from("mentors").select("user_id").in("user_id", uids).eq("active", true) : Promise.resolve({ data: [] as any[] }),
      pollIds.length ? db.from("group_message_poll_votes").select("message_id, user_id, option_idx").in("message_id", pollIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const profBy: Record<string, any> = {};
    for (const p of profs ?? []) profBy[p.id] = p;
    const adminSet = new Set((roles ?? []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
    const mentorSet = new Set((mentorsRows ?? []).map((r: any) => r.user_id));
    const votesByMsg: Record<string, { counts: number[]; my: number | null; total: number }> = {};
    for (const m of list) {
      if (m.kind === "poll") {
        const opts = Array.isArray(m.poll_options) ? m.poll_options : [];
        votesByMsg[m.id] = { counts: opts.map(() => 0), my: null, total: 0 };
      }
    }
    for (const v of votes ?? []) {
      const b = votesByMsg[v.message_id];
      if (!b) continue;
      if (v.option_idx >= 0 && v.option_idx < b.counts.length) b.counts[v.option_idx]++;
      b.total++;
      if (v.user_id === context.userId) b.my = v.option_idx;
    }
    return list.map((m: any) => ({
      ...m,
      mine: m.user_id === context.userId,
      author_name: profBy[m.user_id]?.display_name ?? "Member",
      author_avatar: profBy[m.user_id]?.avatar_url ?? null,
      author_role: adminSet.has(m.user_id) ? "admin" : mentorSet.has(m.user_id) ? "mentor" : "member",
      poll: m.kind === "poll" ? votesByMsg[m.id] : null,
    }));
  });

export const sendGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      group_id: z.string().uuid(),
      body: z.string().max(4000).optional().nullable(),
      attachment_url: z.string().url().max(2000).optional().nullable(),
      reply_to: z.string().uuid().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertGroupMember(context.userId, data.group_id);
    const body = (data.body ?? "").trim();
    if (!body && !data.attachment_url) throw new Error("Empty message");
    const db = await admin();
    const { data: row, error } = await db
      .from("group_messages")
      .insert({
        group_id: data.group_id,
        user_id: context.userId,
        body: body || null,
        attachment_url: data.attachment_url ?? null,
        attachment_type: data.attachment_url ? "image" : null,
        reply_to: data.reply_to ?? null,
        kind: "text",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const createGroupPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      group_id: z.string().uuid(),
      question: z.string().trim().min(1).max(300),
      options: z.array(z.string().trim().min(1).max(120)).min(2).max(10),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canModerate } = await assertGroupMember(context.userId, data.group_id);
    if (!canModerate) throw new Error("Only mentors and admins can create polls");
    const db = await admin();
    const { data: row, error } = await db
      .from("group_messages")
      .insert({
        group_id: data.group_id,
        user_id: context.userId,
        kind: "poll",
        poll_question: data.question,
        poll_options: data.options,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const voteGroupPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ message_id: z.string().uuid(), option_idx: z.number().int().min(0).max(9) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: msg } = await db
      .from("group_messages")
      .select("group_id, kind, poll_options, deleted")
      .eq("id", data.message_id)
      .maybeSingle();
    if (!msg || msg.deleted || msg.kind !== "poll") throw new Error("Poll not found");
    await assertGroupMember(context.userId, msg.group_id);
    const opts = Array.isArray(msg.poll_options) ? msg.poll_options : [];
    if (data.option_idx >= opts.length) throw new Error("Invalid option");
    const { error } = await db
      .from("group_message_poll_votes")
      .upsert({ message_id: data.message_id, user_id: context.userId, option_idx: data.option_idx });
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const pinGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ message_id: z.string().uuid(), pinned: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: msg } = await db.from("group_messages").select("group_id").eq("id", data.message_id).maybeSingle();
    if (!msg) throw new Error("Not found");
    const { canModerate } = await assertGroupMember(context.userId, msg.group_id);
    if (!canModerate) throw new Error("Forbidden");
    const { error } = await db
      .from("group_messages")
      .update({ pinned: data.pinned, pinned_at: data.pinned ? new Date().toISOString() : null })
      .eq("id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGroupMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ message_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: msg } = await db.from("group_messages").select("group_id, user_id").eq("id", data.message_id).maybeSingle();
    if (!msg) throw new Error("Not found");
    const { canModerate } = await assertGroupMember(context.userId, msg.group_id);
    if (!canModerate && msg.user_id !== context.userId) throw new Error("Forbidden");
    const { error } = await db
      .from("group_messages")
      .update({ deleted: true, deleted_by: context.userId, body: null, attachment_url: null })
      .eq("id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const uploadGroupImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      group_id: z.string().uuid(),
      data_url: z.string().startsWith("data:image/").max(6_500_000),
      filename: z.string().max(200).default("image.png"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertGroupMember(context.userId, data.group_id);
    const db = await admin();
    const match = data.data_url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL");
    const mime = match[1];
    const ext = mime.split("/")[1].replace("jpeg", "jpg").split("+")[0];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Image too large (>5MB)");
    const key = `groups/${data.group_id}/${Date.now()}-${context.userId}.${ext}`;
    const { error } = await db.storage.from("mentorship-media").upload(key, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = db.storage.from("mentorship-media").getPublicUrl(key);
    return { url: pub.publicUrl };
  });

// ---------------------------------------------------------------------------
// Weekly targets
// ---------------------------------------------------------------------------
function weekStartISO(d = new Date()): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday.toISOString().slice(0, 10);
}

export const mentorCreateWeeklyTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      group_id: z.string().uuid(),
      week_start: z.string().optional(),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional().nullable(),
      items: z.array(z.string().min(1).max(500)).min(1).max(50),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canModerate } = await assertGroupMember(context.userId, data.group_id);
    if (!canModerate) throw new Error("Forbidden");
    const db = await admin();
    const mid = await myMentorId(context.userId);
    const { data: row, error } = await db
      .from("weekly_targets")
      .insert({
        group_id: data.group_id,
        mentor_id: mid,
        week_start: data.week_start ?? weekStartISO(),
        title: data.title,
        description: data.description ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const items = data.items.map((text, idx) => ({ target_id: row.id, text, order_idx: idx }));
    const { error: ierr } = await db.from("weekly_target_items").insert(items);
    if (ierr) throw new Error(ierr.message);
    return { id: row.id };
  });

export const listGroupWeeklyTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({ group_id: z.string().uuid(), limit: z.number().int().min(1).max(20).default(6) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertGroupMember(context.userId, data.group_id);
    const db = await admin();
    const { data: tgts } = await db
      .from("weekly_targets")
      .select("id, week_start, title, description, created_at")
      .eq("group_id", data.group_id)
      .order("week_start", { ascending: false })
      .limit(data.limit);
    const ids = (tgts ?? []).map((t: any) => t.id);
    const { data: items } = ids.length
      ? await db.from("weekly_target_items").select("id, target_id, text, order_idx").in("target_id", ids).order("order_idx")
      : { data: [] as any[] };
    const itemIds = (items ?? []).map((i: any) => i.id);
    const { data: progress } = itemIds.length
      ? await db.from("weekly_target_progress").select("target_item_id, user_id, done").in("target_item_id", itemIds).eq("user_id", context.userId)
      : { data: [] as any[] };
    const doneSet = new Set((progress ?? []).filter((p: any) => p.done).map((p: any) => p.target_item_id));
    const itemsByTarget: Record<string, any[]> = {};
    for (const it of items ?? []) {
      (itemsByTarget[it.target_id] ||= []).push({ ...it, mine_done: doneSet.has(it.id) });
    }
    return (tgts ?? []).map((t: any) => ({ ...t, items: itemsByTarget[t.id] ?? [] }));
  });

export const toggleWeeklyTargetItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ target_item_id: z.string().uuid(), done: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    if (data.done) {
      const { error } = await db
        .from("weekly_target_progress")
        .upsert({ target_item_id: data.target_item_id, user_id: context.userId, done: true, done_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("weekly_target_progress")
        .delete()
        .eq("target_item_id", data.target_item_id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
