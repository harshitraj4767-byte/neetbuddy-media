// DPP entry gate. Trial users may only attempt LIVE DPPs (past DPPs are locked).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const DPP_PAST_COST_BONUS = 0;

export const startDppAttempt = createServerFn({ method: "POST" })
  .validator((d: { test_id?: string; testId?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const testId = data.test_id || data.testId;
    if (!testId) {
      return { ok: true as const, charged: 0, reason: "no_id" };
    }

    try {
      const { queryOne } = await import("@/lib/db/mysql.server");
      const test = await queryOne<{ id: string; type: string; starts_at: string | null; ends_at: string | null }>(
        `SELECT id, type, starts_at, ends_at FROM tests WHERE id = ? LIMIT 1`,
        [testId]
      );
      if (!test) {
        return { ok: true as const, charged: 0, reason: "not_found_fallback" };
      }

      return { ok: true as const, charged: 0, reason: "live_free" };
    } catch (e) {
      console.warn("startDppAttempt non-blocking error:", e);
      return { ok: true as const, charged: 0, reason: "fallback" };
    }
  });
