import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const PLAN_PRICES = { monthly: 49, yearly: 299 } as const;
export type Plan = keyof typeof PLAN_PRICES;

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("id, plan, status, started_at, expires_at")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { subscription: data ?? null, isPremium: !!data };
  });

/** Internal helper — call from server only */
export async function activateSubscriptionForUser(opts: {
  userId: string;
  plan: Plan;
  razorpay_payment_id: string;
  razorpay_order_id: string;
}) {
  const now = new Date();
  const expires = new Date(now);
  if (opts.plan === "monthly") expires.setMonth(expires.getMonth() + 1);
  else expires.setFullYear(expires.getFullYear() + 1);
  const { error } = await (supabaseAdmin as any).from("subscriptions").insert({
    user_id: opts.userId,
    plan: opts.plan,
    status: "active",
    started_at: now.toISOString(),
    expires_at: expires.toISOString(),
    razorpay_payment_id: opts.razorpay_payment_id,
    razorpay_order_id: opts.razorpay_order_id,
  });
  if (error) throw new Error(`Could not activate subscription: ${error.message}`);
  return { expires_at: expires.toISOString() };
}
