// Client-callable server functions for trial gating that don't already belong
// to a purpose-built gate module. Bookmarks/mistakes test creation and the
// per-download short-notes counter live here so the client no longer inserts
// tests directly against Supabase for these flows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { consumeTrialQuota, getTrialUsage, TRIAL_LIMITS } from "@/lib/trial-limits.server";

export const getMyTrialUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [mock, gen, bm, mis, dl, nl] = await Promise.all([
      getTrialUsage(context.userId, TRIAL_LIMITS.mockAttempt),
      getTrialUsage(context.userId, TRIAL_LIMITS.generateTest),
      getTrialUsage(context.userId, TRIAL_LIMITS.bookmarkTest),
      getTrialUsage(context.userId, TRIAL_LIMITS.mistakesTest),
      getTrialUsage(context.userId, TRIAL_LIMITS.shortNoteDownload),
      getTrialUsage(context.userId, TRIAL_LIMITS.neetlabView),
    ]);
    return { mockAttempt: mock, generateTest: gen, bookmarkTest: bm, mistakesTest: mis, shortNoteDownload: dl, neetlabView: nl };
  });

export const createBookmarkTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ question_ids: z.array(z.string()).min(1).max(300), title: z.string().default("My Bookmarks") }).parse(d))
  .handler(async ({ data, context }) => {
    await consumeTrialQuota(context.userId, TRIAL_LIMITS.bookmarkTest);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.question_ids;
    const { data: t, error } = await (supabaseAdmin as any)
      .from("tests")
      .insert({
        title: data.title,
        type: "bookmark",
        difficulty: "medium",
        duration_min: Math.max(10, Math.ceil(ids.length * 1.5)),
        total_questions: ids.length,
        question_ids: ids,
        created_by: context.userId,
        source: "Bookmark",
      })
      .select("id")
      .maybeSingle();
    if (error || !t) throw new Error(error?.message ?? "Could not create test");
    return { testId: t.id as string };
  });

export const createMistakesTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ question_ids: z.array(z.string()).min(1).max(300), title: z.string().default("My Mistakes Retest") }).parse(d))
  .handler(async ({ data, context }) => {
    await consumeTrialQuota(context.userId, TRIAL_LIMITS.mistakesTest);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.question_ids;
    const { data: t, error } = await (supabaseAdmin as any)
      .from("tests")
      .insert({
        title: data.title,
        type: "practice",
        difficulty: "medium",
        duration_min: Math.max(10, Math.ceil(ids.length * 1.2)),
        total_questions: ids.length,
        question_ids: ids,
        created_by: context.userId,
        source: "My Mistakes",
      })
      .select("id")
      .maybeSingle();
    if (error || !t) throw new Error(error?.message ?? "Could not create test");
    return { testId: t.id as string };
  });

export const logShortNoteDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ material_id: z.string().uuid().optional(), title: z.string().optional() }).parse(d))
  .handler(async ({ context }) => {
    const r = await consumeTrialQuota(context.userId, TRIAL_LIMITS.shortNoteDownload);
    return { ok: true, ...r };
  });

export const logNeetlabView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ topic: z.string().min(1) }).parse(d))
  .handler(async ({ context }) => {
    const r = await consumeTrialQuota(context.userId, TRIAL_LIMITS.neetlabView);
    return { ok: true, ...r };
  });
