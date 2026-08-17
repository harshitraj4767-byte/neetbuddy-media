import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Commission model only — collaborators earn a fixed commission per batch
// purchase made through their coupon (Essential ₹400 · Prime ₹600 · Elite ₹1000).
// There is no revenue-share / investment plan anymore.
const FIXED_MIN_WITHDRAWAL = 100;

export const applyForCollaboratorProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(2).max(120),
      contact: z.string().trim().min(4).max(60),
      email: z.string().trim().email().max(200),
      promo_asset: z.string().trim().min(3).max(500),
      months: z.number().int().min(1).max(60),
      accepted_terms: z.literal(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("collaborator_programs")
      .upsert({
        user_id: context.userId,
        name: data.name,
        contact: data.contact,
        email: data.email,
        promo_asset: data.promo_asset,
        months: data.months,
        // Commission model: keep legacy column satisfied but unused.
        share_pct: 0,
        min_withdrawal: FIXED_MIN_WITHDRAWAL,
        accepted_terms: true,
        status: "pending",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyCollaboratorProgram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    const { data: program } = await supabase
      .from("collaborator_programs")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!program) return {
      program: null, stats: null, invited: [] as any[],
      couponStats: null, coupons: [] as any[],
    };
    const [{ data: statsRows }, { data: invited }, { data: couponStatsRows }, { data: coupons }] = await Promise.all([
      supabase.rpc("collab_my_stats"),
      supabase.rpc("collab_my_invited"),
      supabase.rpc("collab_my_coupon_commissions"),
      supabase.rpc("collab_my_coupon_list"),
    ]);
    return {
      program,
      stats: (statsRows && statsRows[0]) ?? null,
      invited: invited ?? [],
      couponStats: (couponStatsRows && couponStatsRows[0]) ?? { total_redemptions: 0, total_commission: 0 },
      coupons: coupons ?? [],
    };
  });

async function assertAdmin(userId: string) {
  const admin = supabaseAdmin as any;
  const { data } = await admin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: admin only");
}

export const adminListCollaborators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const admin = supabaseAdmin as any;
    const { data: rows, error } = await admin
      .from("collaborator_programs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let nameMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await admin
        .from("profiles").select("id,full_name,email").in("id", ids);
      nameMap = Object.fromEntries((profs ?? []).map((p: any) =>
        [p.id, { full_name: p.full_name, email: p.email }]));
    }

    // Compute per-collaborator commission totals server-side.
    // Commission model only: earnings come from batch purchases made through
    // coupons owned by the collaborator (no investment/revenue-share).
    const out: any[] = [];
    for (const r of rows ?? []) {
      const { data: refs } = await admin
        .from("referrals").select("referred_id").eq("referrer_id", r.user_id);
      const totalInvited = (refs ?? []).length;

      const { data: commRows } = await admin
        .rpc("admin_collab_coupon_commissions", { _user_id: r.user_id });
      const comm = (commRows && commRows[0]) ?? { total_redemptions: 0, total_commission: 0 };

      out.push({
        ...r,
        profile: nameMap[r.user_id] ?? null,
        total_invited: totalInvited,
        total_redemptions: Number(comm.total_redemptions || 0),
        total_commission: Number(comm.total_commission || 0),
      });
    }
    return { rows: out };
  });

export const adminUpdateCollaboratorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["pending", "approved", "rejected", "ended"]),
    admin_notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("collaborator_programs")
      .update({
        status: data.status,
        admin_notes: data.admin_notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
