import { createFileRoute } from "@tanstack/react-router";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Schema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1).max(120),
  last_name: z.string().max(120).optional(),
  username: z.string().max(120).optional(),
  photo_url: z.string().url().max(2000).optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/i),
});

function verifyTelegram(payload: z.infer<typeof Schema>, botToken: string): boolean {
  const { hash, ...rest } = payload;
  const dataCheck = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as Record<string, unknown>)[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hmac = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const a = Buffer.from(hmac, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/telegram/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return Response.json({ error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });

        let parsed: z.infer<typeof Schema>;
        try { parsed = Schema.parse(await request.json()); }
        catch { return Response.json({ error: "Invalid payload" }, { status: 400 }); }

        // Reject stale (>1h) auth_date
        if (Math.abs(Date.now() / 1000 - parsed.auth_date) > 3600) {
          return Response.json({ error: "Stale auth" }, { status: 401 });
        }
        if (!verifyTelegram(parsed, botToken)) {
          return Response.json({ error: "Bad signature" }, { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = `tg_${parsed.id}@telegram.neetiq.local`;
        const fullName = [parsed.first_name, parsed.last_name].filter(Boolean).join(" ");

        // Find or create the user
        let userId: string | null = null;
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const existing = list?.users?.find((u) => u.email === email);
        if (existing) userId = existing.id;
        else {
          const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: fullName, telegram_id: parsed.id, telegram_username: parsed.username, avatar_url: parsed.photo_url, provider: "telegram" },
          });
          if (cErr || !created.user) return Response.json({ error: cErr?.message || "Create failed" }, { status: 500 });
          userId = created.user.id;
        }

        // Issue a session via magic link, then exchange the token for a real session
        const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        if (lErr || !link.properties?.hashed_token) {
          return Response.json({ error: lErr?.message || "Link failed" }, { status: 500 });
        }

        const { data: verified, error: vErr } = await supabaseAdmin.auth.verifyOtp({
          type: "magiclink",
          token_hash: link.properties.hashed_token,
        });
        if (vErr || !verified.session) {
          return Response.json({ error: vErr?.message || "Verify failed" }, { status: 500 });
        }

        return Response.json({
          access_token: verified.session.access_token,
          refresh_token: verified.session.refresh_token,
          user_id: userId,
        });
      },
    },
  },
});
