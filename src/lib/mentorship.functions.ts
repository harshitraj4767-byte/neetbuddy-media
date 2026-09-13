import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAccessForUser } from "@/lib/access.server";

// ---------------------------------------------------------------------------
// Access model
//   - Admins           → full access + moderation
//   - Mentors          → full access + moderation
//   - Elite tier users → chat access + can rate mentors (no moderation)
//   - Everyone else    → no access
// All reads/writes flow through these server functions (service role), so the
// tables stay RLS-locked to the public keys.
// ---------------------------------------------------------------------------

type MentorshipAccess = {
  canAccess: boolean;
  canModerate: boolean;
  isAdmin: boolean;
  isMentor: boolean;
  isMuted: boolean;
};

async function resolveAccess(userId: string): Promise<MentorshipAccess> {
  const admin = supabaseAdmin as any;
  const access = await getAccessForUser(userId);

  const { data: mentorRow } = await admin
    .from("mentors")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  const isMentor = !!mentorRow;

  const { data: mutedRow } = await admin
    .from("mentorship_muted")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const isAdmin = access.isAdmin;
  const canModerate = isAdmin || isMentor;
  const canAccess = isAdmin || isMentor || access.tier === "elite";

  return { canAccess, canModerate, isAdmin, isMentor, isMuted: !!mutedRow };
}

function requireAccess(a: MentorshipAccess) {
  if (!a.canAccess) {
    throw new Error("Mentorship Program is available to Elite members, mentors and admins only.");
  }
}
function requireModerate(a: MentorshipAccess) {
  if (!a.canModerate) throw new Error("Only mentors and admins can perform this action.");
}

// ---------------------------------------------------------------------------
// Access + directory bootstrap
// ---------------------------------------------------------------------------
export const getMentorshipOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    if (!a.canAccess) {
      return { access: a, mentors: [] as any[] };
    }

    const { data: mentors } = await admin
      .from("mentors")
      .select("id, user_id, display_name, title, bio, avatar_url")
      .eq("active", true)
      .order("display_name");

    const mentorIds = (mentors ?? []).map((m: any) => m.id);
    let ratingsByMentor: Record<string, { avg: number; count: number; mine: number | null }> = {};
    if (mentorIds.length) {
      const { data: ratings } = await admin
        .from("mentor_ratings")
        .select("mentor_id, rating, user_id")
        .in("mentor_id", mentorIds);
      for (const id of mentorIds) ratingsByMentor[id] = { avg: 0, count: 0, mine: null };
      const sums: Record<string, number> = {};
      for (const r of ratings ?? []) {
        const b = ratingsByMentor[r.mentor_id];
        if (!b) continue;
        sums[r.mentor_id] = (sums[r.mentor_id] || 0) + r.rating;
        b.count += 1;
        if (r.user_id === context.userId) b.mine = r.rating;
      }
      for (const id of mentorIds) {
        const b = ratingsByMentor[id];
        b.avg = b.count ? Math.round((sums[id] / b.count) * 10) / 10 : 0;
      }
    }

    const mentorsOut = (mentors ?? []).map((m: any) => ({
      ...m,
      rating_avg: ratingsByMentor[m.id]?.avg ?? 0,
      rating_count: ratingsByMentor[m.id]?.count ?? 0,
      my_rating: ratingsByMentor[m.id]?.mine ?? null,
    }));

    return { access: a, mentors: mentorsOut };
  });

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const listMentorshipMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireAccess(a);

    const limit = data.limit ?? 100;
    const { data: rows } = await admin
      .from("mentorship_messages")
      .select("id, user_id, body, attachment_url, attachment_type, pinned, pinned_at, created_at")
      .eq("deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    const list = (rows ?? []).reverse();
    const userIds = Array.from(new Set(list.map((m: any) => m.user_id)));

    // Author identities + which authors are mentors/admins (for badges)
    const [{ data: profs }, { data: mentorRows }, { data: adminRows }] = await Promise.all([
      userIds.length ? admin.from("profiles").select("id, full_name, email, avatar_url").in("id", userIds) : Promise.resolve({ data: [] }),
      userIds.length ? admin.from("mentors").select("user_id").in("user_id", userIds) : Promise.resolve({ data: [] }),
      userIds.length ? admin.from("user_roles").select("user_id").eq("role", "admin").in("user_id", userIds) : Promise.resolve({ data: [] }),
    ]);
    const pMap: Record<string, any> = {};
    for (const p of profs ?? []) pMap[p.id] = p;
    const mentorSet = new Set((mentorRows ?? []).map((r: any) => r.user_id));
    const adminSet = new Set((adminRows ?? []).map((r: any) => r.user_id));

    const messages = list.map((m: any) => ({
      ...m,
      mine: m.user_id === context.userId,
      author_name: pMap[m.user_id]?.full_name ?? pMap[m.user_id]?.email ?? "Member",
      author_avatar: pMap[m.user_id]?.avatar_url ?? null,
      author_role: adminSet.has(m.user_id) ? "admin" : mentorSet.has(m.user_id) ? "mentor" : "member",
    }));

    return { access: a, messages };
  });

export const sendMentorshipMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      body: z.string().trim().max(4000).optional(),
      attachment_url: z.string().trim().url().max(1000).optional(),
      attachment_type: z.literal("image").optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireAccess(a);
    if (a.isMuted) throw new Error("You have been muted in the Mentorship group.");

    const body = data.body?.trim() || null;
    const hasAttachment = !!data.attachment_url;
    if (!body && !hasAttachment) throw new Error("Message cannot be empty.");

    const { data: row, error } = await admin
      .from("mentorship_messages")
      .insert({
        user_id: context.userId,
        body,
        attachment_url: hasAttachment ? data.attachment_url : null,
        attachment_type: hasAttachment ? "image" : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const pinMentorshipMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireModerate(a);
    const { error } = await admin
      .from("mentorship_messages")
      .update({ pinned: data.pinned, pinned_at: data.pinned ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMentorshipMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    // Moderators can delete anything; authors can delete their own message.
    const { data: msg } = await admin
      .from("mentorship_messages").select("user_id").eq("id", data.id).maybeSingle();
    if (!msg) throw new Error("Message not found.");
    if (!a.canModerate && msg.user_id !== context.userId) {
      throw new Error("You can only delete your own messages.");
    }
    const { error } = await admin
      .from("mentorship_messages")
      .update({ deleted: true, deleted_by: context.userId, pinned: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Muting
// ---------------------------------------------------------------------------
export const muteMentorshipUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ user_id: z.string().uuid(), muted: z.boolean(), reason: z.string().trim().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireModerate(a);
    if (data.muted) {
      const { error } = await admin
        .from("mentorship_muted")
        .upsert({ user_id: data.user_id, muted_by: context.userId, reason: data.reason ?? null }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("mentorship_muted").delete().eq("user_id", data.user_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listMutedUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireModerate(a);
    const { data: rows } = await admin.from("mentorship_muted").select("user_id, reason, created_at");
    const ids = (rows ?? []).map((r: any) => r.user_id);
    let pMap: Record<string, any> = {};
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("id, full_name, email").in("id", ids);
      for (const p of profs ?? []) pMap[p.id] = p;
    }
    return { rows: (rows ?? []).map((r: any) => ({ ...r, name: pMap[r.user_id]?.full_name ?? pMap[r.user_id]?.email ?? r.user_id })) };
  });

// ---------------------------------------------------------------------------
// Mentor ratings
// ---------------------------------------------------------------------------
export const rateMentor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      mentor_id: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const a = await resolveAccess(context.userId);
    requireAccess(a);
    const { error } = await admin
      .from("mentor_ratings")
      .upsert(
        {
          mentor_id: data.mentor_id,
          user_id: context.userId,
          rating: data.rating,
          comment: data.comment ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "mentor_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
