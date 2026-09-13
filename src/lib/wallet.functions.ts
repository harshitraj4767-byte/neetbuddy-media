// Withdrawal / referral-payout server functions.
// The wallet system has been removed; these endpoints now operate on the
// referral earnings model where each unpaid `public.referrals` row contributes
// its `referrer_bonus` to the user's available balance.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const bankSchema = z.object({
  amount: z.number().int().min(1000, "Minimum ₹1000"),
  account_holder: z.string().trim().min(2).max(120),
  account_number: z.string().trim().min(6).max(30),
  ifsc: z.string().trim().min(6).max(20),
  upi_id: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

async function getBalance(admin: any, userId: string): Promise<{ available: number; paid: number }> {
  const { data: rows } = await admin
    .from("referrals")
    .select("referrer_bonus, paid_out")
    .eq("referrer_id", userId);
  let total = 0;
  let paid = 0;
  for (const r of (rows ?? []) as Array<{ referrer_bonus: number | string; paid_out: boolean }>) {
    const v = Number(r.referrer_bonus) || 0;
    total += v;
    if (r.paid_out) paid += v;
  }
  // Also subtract pending withdrawals (locked funds)
  const { data: pending } = await admin
    .from("withdrawal_requests")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "pending");
  const locked = ((pending ?? []) as Array<{ amount: number | string }>).reduce(
    (a, r) => a + (Number(r.amount) || 0),
    0,
  );
  return { available: Math.max(0, total - paid - locked), paid };
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => bankSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { available } = await getBalance(admin, context.userId);
    if (data.amount > available) {
      throw new Error(`Insufficient balance. Available ₹${available}`);
    }
    const note =
      (data.upi_id ? `UPI: ${data.upi_id}` : "Bank transfer") +
      (data.note ? ` — ${data.note}` : "");
    const { data: row, error } = await admin
      .from("withdrawal_requests")
      .insert({
        user_id: context.userId,
        amount: data.amount,
        upi_or_note: note,
        status: "pending",
        bank_account_name: data.account_holder,
        bank_account_number: data.account_number,
        bank_ifsc: data.ifsc,
        upi_id: data.upi_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any)
      .from("withdrawal_requests")
      .select("id, amount, status, admin_note, created_at, paid_at, processed_at, bank_account_name, bank_account_number, bank_ifsc, upi_id")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []) as Array<{
      id: string;
      amount: number;
      status: "pending" | "paid" | "rejected";
      admin_note: string | null;
      created_at: string;
      paid_at: string | null;
      processed_at: string | null;
      bank_account_name: string | null;
      bank_account_number: string | null;
      bank_ifsc: string | null;
      upi_id: string | null;
    }>;
  });

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const adminListPendingWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: rows } = await admin
      .from("withdrawal_requests")
      .select("id,user_id,amount,upi_or_note,created_at,bank_account_name,bank_account_number,bank_ifsc,upi_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (rows ?? []) as Array<Record<string, any>>;
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    let map: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      map = Object.fromEntries(((profs ?? []) as any[]).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
    }
    const balances: Record<string, number> = {};
    for (const uid of ids) balances[uid] = (await getBalance(admin, uid)).available;
    return list.map((r) => ({
      ...r,
      full_name: map[r.user_id]?.full_name ?? null,
      email: map[r.user_id]?.email ?? null,
      available_balance: balances[r.user_id] ?? 0,
    }));
  });

export const adminApproveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(500).optional().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: req, error: e1 } = await admin
      .from("withdrawal_requests")
      .select("id,user_id,amount,status")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!req) throw new Error("Not found");
    if (req.status !== "pending") throw new Error(`Already ${req.status}`);

    // Mark unpaid referrals as paid_out up to the withdrawal amount (FIFO).
    const { data: unpaid } = await admin
      .from("referrals")
      .select("id, referrer_bonus, created_at")
      .eq("referrer_id", req.user_id)
      .eq("paid_out", false)
      .order("created_at", { ascending: true });
    let remaining = Number(req.amount);
    const toMark: string[] = [];
    for (const r of (unpaid ?? []) as Array<{ id: string; referrer_bonus: number | string }>) {
      if (remaining <= 0) break;
      toMark.push(r.id);
      remaining -= Number(r.referrer_bonus) || 0;
    }
    if (toMark.length) {
      const { error: eu } = await admin.from("referrals").update({ paid_out: true }).in("id", toMark);
      if (eu) throw new Error(eu.message);
    }

    const nowIso = new Date().toISOString();
    const { error: e2 } = await admin
      .from("withdrawal_requests")
      .update({
        status: "paid",
        admin_note: data.note ?? "Paid",
        processed_at: nowIso,
        processed_by: context.userId,
        paid_at: nowIso,
      })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const adminRejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().min(2).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { error } = await admin
      .from("withdrawal_requests")
      .update({
        status: "rejected",
        admin_note: data.note,
        processed_at: new Date().toISOString(),
        processed_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
