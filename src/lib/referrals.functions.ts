import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomCode(len = 7): string {
  // Avoid 0/O/1/I for readability.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Generate or return existing referral code for the current user. Idempotent. */
export const generateReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const admin = supabaseAdmin as any;

    const { data: existing } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();
    if (existing?.referral_code) return { code: existing.referral_code as string };

    // Try a few times in case of collision on the unique index.
    let lastErr: any = null;
    for (let i = 0; i < 6; i++) {
      const code = randomCode(7);
      const { data, error } = await admin
        .from("profiles")
        .update({ referral_code: code })
        .eq("id", userId)
        .is("referral_code", null)
        .select("referral_code")
        .maybeSingle();
      if (!error && data?.referral_code) return { code: data.referral_code as string };
      lastErr = error;
      // If another writer set it concurrently, return what's there.
      const { data: again } = await admin
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();
      if (again?.referral_code) return { code: again.referral_code as string };
    }
    console.error("Failed to generate referral code", lastErr);
    throw new Error("Could not generate referral code");
  });


export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ code: z.string().min(4).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: result, error } = await supabase.rpc("apply_referral_code", {
      p_code: data.code.trim().toUpperCase(),
    });
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (msg.includes("already")) throw new Error("You've already used a referral code.");
      if (msg.includes("invalid")) throw new Error("That referral code doesn't exist.");
      if (msg.includes("yourself")) throw new Error("You can't refer yourself.");
      throw new Error(error.message);
    }
    return result as { ok: true; referrer_id: string };
  });

export const getMyReferralInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = supabaseAdmin as any;
    const userId = context.userId;
    const [{ data: prof }, { data: invited }, { data: purchases }, { data: collab }, { data: pendingWithdraws }] = await Promise.all([
      admin.from("profiles")
        .select("referral_code,referral_credited,referred_by")
        .eq("id", userId)
        .maybeSingle(),
      admin.from("referrals")
        .select("id,referred_id,referrer_bonus,paid_out,batch_tier,created_at")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("batch_purchases")
        .select("amount_paid, status, batches:batches(title)")
        .eq("user_id", userId)
        .eq("status", "active"),
      admin.from("collaborator_programs")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle(),
      admin.from("withdrawal_requests")
        .select("amount")
        .eq("user_id", userId)
        .eq("status", "pending"),
    ]);

    // Resolve invited friends' names with the admin client (RLS blocks reading
    // other users' profiles from the user-scoped client).
    const invitedRows = (invited ?? []) as Array<{
      id: string; referred_id: string; referrer_bonus: number;
      paid_out: boolean; batch_tier: string | null; created_at: string;
    }>;
    let nameMap: Record<string, { full_name: string | null; email: string | null }> = {};
    const ids = Array.from(new Set(invitedRows.map((r) => r.referred_id)));
    if (ids.length > 0) {
      const { data: profs } = await admin
        .from("profiles").select("id,full_name,email").in("id", ids);
      nameMap = Object.fromEntries(
        (profs ?? []).map((p: any) => [p.id, { full_name: p.full_name ?? null, email: p.email ?? null }]),
      );
    }

    // Derive tier from highest active batch purchase (or Essential by default).
    const titles = ((purchases ?? []) as any[]).map((p) => String(p.batches?.title ?? "").toLowerCase());
    const has = (k: string) => titles.some((t) => t.includes(k));
    const isCollaborator = (collab as { status?: string } | null)?.status === "approved";
    let tier: 1 | 2 | 3 = 1;
    let tierName: "Essential" | "Prime" | "Elite" = "Essential";
    if (has("elite")) { tier = 3; tierName = "Elite"; }
    else if (has("prime")) { tier = 2; tierName = "Prime"; }

    // Balance = sum(referrer_bonus where not paid_out) - pending withdrawals.
    const earned = invitedRows.reduce((a, r) => a + Number(r.referrer_bonus || 0), 0);
    const paidOut = invitedRows.filter((r) => r.paid_out).reduce((a, r) => a + Number(r.referrer_bonus || 0), 0);
    const locked = ((pendingWithdraws ?? []) as Array<{ amount: number | string }>).reduce((a, r) => a + Number(r.amount || 0), 0);
    const available = Math.max(0, earned - paidOut - locked);

    return {
      code: (prof?.referral_code as string | null) ?? null,
      hasUsedCode: !!prof?.referral_credited,
      tier,
      tierName,
      isCollaborator,
      balance: {
        earned,
        paidOut,
        pending: locked,
        available,
      },
      invited: invitedRows.map((r) => ({
        ...r,
        profiles: nameMap[r.referred_id] ?? { full_name: null, email: null },
      })) as Array<{
        id: string;
        referred_id: string;
        referrer_bonus: number;
        paid_out: boolean;
        batch_tier: string | null;
        created_at: string;
        profiles: { full_name: string | null; email: string | null } | null;
      }>,
    };
  });

