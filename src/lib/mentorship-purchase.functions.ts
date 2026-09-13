import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mentorship program plans — server-authoritative pricing (₹).
export const MENTORSHIP_PLANS = {
  "1m":   { label: "1 Month",          price: 1999, days: 30  },
  "6m":   { label: "6 Months",         price: 5499, days: 180 },
  "neet": { label: "Till NEET 2026",   price: 8999, days: 365 },
} as const;
export type MentorshipPlanKey = keyof typeof MENTORSHIP_PLANS;

function creds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Payments are not configured (Razorpay keys missing).");
  return { keyId, keySecret };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function findCoupon(db: any, code: string, plan: MentorshipPlanKey) {
  const { data: coupon } = await db.from("coupons")
    .select("*").ilike("code", code.trim()).maybeSingle();
  if (!coupon || !coupon.active) throw new Error("Invalid coupon");
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) throw new Error("Coupon expired");
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) throw new Error("Coupon usage limit reached");
  // Only allow coupons that target mentorship (or all — no program).
  if (coupon.program && coupon.program !== "mentorship") throw new Error("Coupon is not valid for mentorship");
  if (coupon.allowed_plans && Array.isArray(coupon.allowed_plans) && coupon.allowed_plans.length > 0) {
    if (!coupon.allowed_plans.includes(`mentorship_${plan}`)) throw new Error("Coupon is not valid for this plan");
  }
  return coupon;
}

function applyDiscount(base: number, coupon: any | null) {
  if (!coupon) return { finalAmount: base, discount: 0 };
  let d = coupon.kind === "percent" ? (base * Number(coupon.value)) / 100 : Number(coupon.value);
  d = Math.min(d, base);
  const finalAmount = Math.max(0, Math.round((base - d) * 100) / 100);
  return { finalAmount, discount: Math.round((base - finalAmount) * 100) / 100 };
}

const PreviewSchema = z.object({
  plan: z.enum(["1m", "6m", "neet"]),
  coupon_code: z.string().min(1).max(40).optional().nullable(),
});

export const previewMentorshipCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => PreviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const plan = MENTORSHIP_PLANS[data.plan];
    const base = plan.price;
    if (!data.coupon_code) return { base, finalAmount: base, discount: 0, coupon_id: null as string | null };
    const db = await admin();
    const coupon = await findCoupon(db, data.coupon_code, data.plan);
    // Per-user single use guard.
    const { data: already } = await db.from("coupon_redemptions")
      .select("id").eq("coupon_id", coupon.id).eq("user_id", context.userId).maybeSingle();
    if (already) throw new Error("Coupon already used");
    const { finalAmount, discount } = applyDiscount(base, coupon);
    return { base, finalAmount, discount, coupon_id: coupon.id as string, code: coupon.code as string };
  });

const OrderSchema = z.object({
  plan: z.enum(["1m", "6m", "neet"]),
  coupon_code: z.string().min(1).max(40).optional().nullable(),
});

export const createMentorshipOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => OrderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = creds();
    const db = await admin();
    const plan = MENTORSHIP_PLANS[data.plan];
    let coupon: any | null = null;
    if (data.coupon_code) coupon = await findCoupon(db, data.coupon_code, data.plan);
    const { finalAmount, discount } = applyDiscount(plan.price, coupon);
    const amountPaise = Math.round(finalAmount * 100);
    if (amountPaise < 100) throw new Error("Amount too small");

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `nb_ment_${data.plan}_${Date.now()}`,
        notes: {
          user_id: context.userId,
          program: "mentorship",
          plan: data.plan,
          coupon_id: coupon?.id ?? "",
        },
      }),
    });
    const orderJson: any = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderJson?.error?.description ?? "Razorpay order failed");

    return {
      orderId: orderJson.id as string,
      keyId,
      amount: amountPaise,
      finalAmount,
      discount,
      currency: "INR",
      coupon_id: coupon?.id ?? null,
      plan: data.plan,
    };
  });

const VerifySchema = z.object({
  razorpay_order_id: z.string().min(3),
  razorpay_payment_id: z.string().min(3),
  razorpay_signature: z.string().min(3),
  plan: z.enum(["1m", "6m", "neet"]),
  coupon_id: z.string().uuid().nullable().optional(),
});

export const verifyMentorshipPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => VerifySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { keySecret } = creds();
    const expected = crypto.createHmac("sha256", keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`).digest("hex");
    if (expected !== data.razorpay_signature) throw new Error("Invalid payment signature");
    const db = await admin();
    const plan = MENTORSHIP_PLANS[data.plan];

    const now = new Date();
    const expires = new Date(now.getTime() + plan.days * 24 * 3600 * 1000);
    const planCol = `mentorship_${data.plan}`;

    // Create subscription (elite-level access is derived in access.server.ts from the plan name).
    const { error: subErr } = await db.from("subscriptions").insert({
      user_id: context.userId,
      plan: planCol,
      status: "active",
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
      razorpay_payment_id: data.razorpay_payment_id,
      razorpay_order_id: data.razorpay_order_id,
    });
    if (subErr) throw new Error(`Could not activate mentorship: ${subErr.message}`);

    // Record coupon redemption (best effort — never block the activation).
    if (data.coupon_id) {
      try {
        await db.from("coupon_redemptions").insert({
          coupon_id: data.coupon_id,
          user_id: context.userId,
          program: "mentorship",
        });
        await db.rpc("increment_coupon_used", { _coupon_id: data.coupon_id }).catch(async () => {
          // Fallback: raw update
          const { data: c } = await db.from("coupons").select("used_count").eq("id", data.coupon_id).maybeSingle();
          await db.from("coupons").update({ used_count: (c?.used_count ?? 0) + 1 }).eq("id", data.coupon_id);
        });
      } catch { /* ignore */ }
    }

    // Credit a generous mentorship bonus (best effort).
    try {
      await db.rpc("credit_bonus_balance", { _user_id: context.userId, _amount: 99999 });
    } catch { /* bonus feature may be disabled — ignore */ }

    return { ok: true, expires_at: expires.toISOString(), plan: planCol };
  });
