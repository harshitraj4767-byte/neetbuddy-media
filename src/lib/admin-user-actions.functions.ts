// Admin actions on a user: suspend / unsuspend, adjust balance.
// All actions write an audit row in wallet_transactions when financial,
// and use the Supabase Auth Admin API for ban/unban.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pushNotification } from "@/lib/notifications.functions";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

/** Suspend (ban) or unsuspend a user via Supabase Auth Admin API. */
export const adminSuspendUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        suspend: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("You cannot suspend your own account");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    // Long ban for "indefinite", explicit "none" to unban.
    const ban_duration = data.suspend ? "876000h" : "none"; // ~100 years
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      ban_duration,
      app_metadata: { suspended: data.suspend, suspended_reason: data.reason ?? null, suspended_by: context.userId, suspended_at: new Date().toISOString() },
    });
    if (error) throw new Error(error.message);
    // Audit row.
    await admin.from("wallet_transactions").insert({
      user_id: data.userId,
      amount: 0,
      type: data.suspend ? "admin_suspend" : "admin_unsuspend",
      bucket: "deposit",
      status: "completed",
      reference: `admin:${context.userId}`,
      meta: { reason: data.reason ?? null, by: context.userId },
    });
    return { ok: true, suspended: data.suspend };
  });

/** Adjust a user's balance (credit or debit). Reason is required for audit. */
export const adminAdjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().refine((n) => n !== 0 && Math.abs(n) <= 100000, "amount must be non-zero and within ₹100000"),
        bucket: z.enum(["deposit", "winnings", "bonus"]),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const colMap: Record<string, string> = {
      deposit: "deposit_balance",
      winnings: "winnings_balance",
      bonus: "bonus_balance",
    };
    const col = colMap[data.bucket];
    const { data: prof, error: pErr } = await admin
      .from("profiles")
      .select(`id,wallet_balance,${col}`)
      .eq("id", data.userId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prof) throw new Error("User profile not found");
    const newBucket = Number(prof[col] ?? 0) + data.amount;
    const newWallet = Number(prof.wallet_balance ?? 0) + data.amount;
    if (newBucket < 0) throw new Error(`Adjustment would make ${data.bucket} bucket negative (${newBucket.toFixed(2)})`);
    if (newWallet < 0) throw new Error(`Adjustment would make wallet negative (${newWallet.toFixed(2)})`);
    const { error: uErr } = await admin
      .from("profiles")
      .update({ [col]: newBucket, wallet_balance: newWallet })
      .eq("id", data.userId);
    if (uErr) throw new Error(uErr.message);
    await admin.from("wallet_transactions").insert({
      user_id: data.userId,
      amount: data.amount,
      type: data.amount > 0 ? "admin_credit" : "admin_debit",
      bucket: data.bucket,
      status: "completed",
      reference: `admin:${context.userId}`,
      meta: { reason: data.reason, by: context.userId },
    });
    // Notify the user with the admin's reason so it shows up in the bell + wallet logs.
    try {
      const isCredit = data.amount > 0;
      const abs = Math.abs(data.amount).toFixed(2);
      await pushNotification({
        user_id: data.userId,
        kind: isCredit ? "admin_credit" : "admin_debit",
        title: isCredit
          ? `Admin credited ₹${abs} to your ${data.bucket} balance`
          : `Admin debited ₹${abs} from your ${data.bucket} balance`,
        body: data.reason,
        link: "/wallet",
      });
    } catch (e) { console.error("notify admin adjustment failed", e); }
    return { ok: true, newWallet, newBucket };
  });
