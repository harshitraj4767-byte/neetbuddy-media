import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/public/razorpay/order
// Body: { amount: number (paise), receipt?: string, notes?: Record<string,string> }
// Returns: { order_id, amount, currency, key_id }
export const Route = createFileRoute("/api/public/razorpay/order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) {
          return Response.json(
            { error: "Razorpay is not configured on the server." },
            { status: 500 },
          );
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = z
          .object({
            amount: z.number().int().min(100).max(10_000_000),
            receipt: z.string().max(64).optional(),
            notes: z.record(z.string(), z.string()).optional(),
          })
          .safeParse(raw);
        if (!parsed.success) {
          return Response.json({ error: parsed.error.message }, { status: 400 });
        }

        const auth = "Basic " + btoa(`${keyId}:${keySecret}`);
        const resp = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: auth },
          body: JSON.stringify({
            amount: parsed.data.amount,
            currency: "INR",
            receipt: parsed.data.receipt ?? `nb_${Date.now()}`,
            notes: parsed.data.notes ?? {},
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          return Response.json(
            { error: `Razorpay error: ${text}` },
            { status: 502 },
          );
        }

        const order = (await resp.json()) as {
          id: string;
          amount: number;
          currency: string;
        };
        return Response.json({
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          key_id: keyId,
        });
      },
    },
  },
});
