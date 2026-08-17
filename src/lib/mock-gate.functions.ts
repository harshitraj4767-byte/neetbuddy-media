// Mock-test entry gate. Now purely entitlement-based: users need "mock_tests"
// feature (included in Essential/Trial+). Bonus charging removed.
// Trial users get only 5 first-time mock attempts (lifetime).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/access.server";
import { consumeTrialQuota, TRIAL_LIMITS } from "@/lib/trial-limits.server";

export const MOCK_COST_BONUS = 0;

export const startMockAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ test_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("id,type")
      .eq("id", data.test_id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!test) throw new Error("Test not found");
    if (test.type !== "mock") {
      return { ok: true as const, charged: 0, reason: "not_mock" };
    }

    // Resume existing attempt for free — doesn't count against trial quota.
    const { data: existing } = await supabase
      .from("attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("test_id", data.test_id)
      .limit(1);
    if (existing && existing.length > 0) {
      return { ok: true as const, charged: 0, reason: "resume" };
    }

    // Must have mock_tests feature.
    await requireFeature(userId, "mock_tests");
    // Trial users: first 5 mock attempts only.
    await consumeTrialQuota(userId, TRIAL_LIMITS.mockAttempt);
    return { ok: true as const, charged: 0, reason: "entitled" };
  });
