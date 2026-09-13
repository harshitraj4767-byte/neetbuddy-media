// THIN server-function wrapper. Module scope must contain ONLY imports,
// erased types and exported server-function declarations — the server-fn
// splitter deletes runtime siblings from this file, which previously caused
// `computePrizeSplit is not defined` / `supabaseAdmin is not defined`
// ReferenceErrors at runtime on the contest join + results pages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminCreateContest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        title: z.string().min(3).max(120),
        description: z.string().max(500).optional(),
        starts_at: z.string().min(10),
        duration_min: z.number().int().min(5).max(180),
        total_questions: z.number().int().min(5).max(200),
        chapter_ids: z.array(z.string()).min(1).max(50),
        difficulty_mix: z
          .object({
            easy: z.number().int().min(0).max(100).default(20),
            medium: z.number().int().min(0).max(100).default(45),
            hard: z.number().int().min(0).max(100).default(35),
          })
          .default({ easy: 20, medium: 45, hard: 35 }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { adminCreateContestImpl } = await import("@/lib/contests.server");
    return adminCreateContestImpl(data, context);
  });

export const joinContest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        contest_id: z.string().uuid(),
        // Daily Live Quiz is always free. Kept for backwards compat.
        entry_fee: z.number().default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { joinContestImpl } = await import("@/lib/contests.server");
    return joinContestImpl(data, context as never);
  });

export const listPastContests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listPastContestsImpl } = await import("@/lib/contests.server");
    return listPastContestsImpl();
  });

export const getContestDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ contest_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getContestDetailImpl } = await import("@/lib/contests.server");
    return getContestDetailImpl(data, context);
  });
