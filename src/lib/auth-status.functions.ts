// Public server fn used by the login page when sign-in fails: looks up the
// reason an account was suspended (from auth.users.app_metadata) so users
// see a clear "Your account is suspended: <reason>" instead of a generic
// Supabase "User banned" string.
//
// This is unauthenticated (the caller is, by definition, not signed in yet),
// but it ONLY ever returns:
//   - whether the email is currently suspended/banned
//   - the admin-provided reason text
// No PII, no balances, no role info. Email -> reason is the minimum required
// signal to render a helpful error message.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Result =
  | { suspended: true; reason: string | null; suspendedAt: string | null }
  | { suspended: false };

export const getSuspensionReasonByEmail = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().email().max(320) }).parse(input),
  )
  .handler(async ({ data }): Promise<Result> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    try {
      // Auth Admin API: list with email filter (Supabase doesn't expose a
      // direct getUserByEmail). Page size 1 is enough.
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const u = (list?.users ?? []).find(
        (x: any) => (x?.email ?? "").toLowerCase() === data.email.toLowerCase(),
      );
      if (!u) return { suspended: false };
      const meta = (u.app_metadata ?? {}) as Record<string, any>;
      const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0;
      const isBanned = bannedUntil > Date.now() || meta.suspended === true;
      if (!isBanned) return { suspended: false };
      return {
        suspended: true,
        reason:
          typeof meta.suspended_reason === "string" && meta.suspended_reason.trim()
            ? meta.suspended_reason.trim()
            : null,
        suspendedAt:
          typeof meta.suspended_at === "string" ? meta.suspended_at : null,
      };
    } catch (e) {
      console.error("[auth-status] lookup failed", e);
      return { suspended: false };
    }
  });
