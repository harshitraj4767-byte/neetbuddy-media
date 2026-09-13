import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Razorpay integration for batch purchases.
 *
 * Env:
 *  - RAZORPAY_KEY_ID
 *  - RAZORPAY_KEY_SECRET
 */

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

const CreateSchema = z.object({
  amount: z.number().positive(),           // rupees
  purpose: z.string().default("batch"),
  batch_id: z.string().uuid(),
  coupon_code: z.string().optional().nullable(),
});

export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { keyId, keySecret } = creds();
    const db = await admin();

    // Look up the batch + validate amount matches the price (server-authoritative).
    const { data: batch, error: bErr } = await db
      .from("batches")
      .select("id, title, price, discounted_price, active")
      .eq("id", data.batch_id)
      .maybeSingle();
    if (bErr || !batch) throw new Error("Batch not found");
    if (!batch.active) throw new Error("Batch is not available");

    let mrp = Number(batch.price);
    let finalAmount = Number(batch.discounted_price);
    let couponId: string | null = null;
    let discount = mrp - finalAmount;

    if (data.coupon_code) {
      const { data: coupon } = await db
        .from("coupons").select("*")
        .ilike("code", data.coupon_code.trim())
        .maybeSingle();
      if (coupon && coupon.active) {
        const base = Number(batch.discounted_price);
        let d = coupon.kind === "percent" ? (base * Number(coupon.value)) / 100 : Number(coupon.value);
        d = Math.min(d, base);
        finalAmount = Math.max(0, Math.round((base - d) * 100) / 100);
        couponId = coupon.id;
        discount = mrp - finalAmount;
      }
    }

    // Trust the coupon-adjusted final amount, but ensure the client's amount is not way off (± ₹1).
    if (Math.abs(finalAmount - Number(data.amount)) > 1) {
      throw new Error("Amount mismatch — please retry.");
    }

    const amountPaise = Math.round(finalAmount * 100);
    if (amountPaise < 100) throw new Error("Amount too small");

    // Create Razorpay order
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: `bp_${Date.now()}`,
        notes: { user_id: context.userId, batch_id: batch.id, purpose: data.purpose },
      }),
    });
    const orderJson: any = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderJson?.error?.description ?? "Razorpay order failed");

    // Record pending purchase
    const { error: rpcErr } = await db.rpc("create_batch_purchase", {
      _batch_id: batch.id,
      _amount: finalAmount,
      _coupon_id: couponId,
      _mrp: mrp,
      _discount: discount,
      _razorpay_order_id: orderJson.id,
    });
    if (rpcErr) {
      // Fallback direct insert
      await db.from("batch_purchases").insert({
        user_id: context.userId,
        batch_id: batch.id,
        amount_paid: finalAmount, mrp, discount_amount: discount,
        coupon_id: couponId, status: "pending", razorpay_order_id: orderJson.id,
      });
    }

    return {
      orderId: orderJson.id as string,
      keyId,
      amount: amountPaise,
      currency: "INR",
    };
  });

const VerifySchema = z.object({
  razorpay_order_id: z.string().min(3),
  razorpay_payment_id: z.string().min(3),
  razorpay_signature: z.string().min(3),
});

export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => VerifySchema.parse(d))
  .handler(async ({ data }) => {
    const { keySecret } = creds();
    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    if (expected !== data.razorpay_signature) {
      throw new Error("Invalid payment signature");
    }
    const db = await admin();
    const { data: purchaseId, error } = await db.rpc("activate_batch_purchase", {
      _razorpay_order_id: data.razorpay_order_id,
      _razorpay_payment_id: data.razorpay_payment_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, purchase_id: purchaseId as string };
  });
