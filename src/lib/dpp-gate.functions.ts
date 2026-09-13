// DPP entry gate. Trial users may only attempt LIVE DPPs (past DPPs are locked).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/access.server";
import { isTrialUser } from "@/lib/trial-limits.server";

export const DPP_PAST_COST_BONUS = 0;

export const startDppAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("id,type,starts_at,ends_at")
      .eq("id", data.test_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!test) throw new Error("Test not found");

    if (test.type !== "daily") {
      return { ok: true as const, charged: 0, reason: "not_daily" };
    }

    const now = Date.now();
    const startMs = test.starts_at ? new Date(test.starts_at as string).getTime() : null;
    const endMs = test.ends_at ? new Date(test.ends_at as string).getTime() : null;
    const isLive = (startMs === null || startMs <= now) && (endMs === null || endMs > now);

    if (isLive) {
      // Still require the feature — live DPPs are only for entitled users.
      await requireFeature(userId, "daily_dpp");
      return { ok: true as const, charged: 0, reason: "live_free" };
    }

    // Resume any existing attempt (already unlocked once).
    const { data: existing } = await supabase
      .from("attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("test_id", data.test_id)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: true as const, charged: 0, reason: "resume" };
    }

    // Past DPP + trial user → hard-locked. Trial only gets LIVE DPPs.
    if (await isTrialUser(userId)) {
      throw new Error("Free trial can only attempt LIVE DPPs. Upgrade to Prime or Elite to unlock past DPPs.");
    }
    await requireFeature(userId, "daily_dpp");
    return { ok: true as const, charged: 0, reason: "entitled" };
  });
