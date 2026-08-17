import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/access.server";

type Feature = "flashcards" | "ncert_highlights";

/**
 * Access gate for premium study tools. Bonus charging has been removed —
 * users need an active batch/trial that includes the feature.
 */
export const accessStudyFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { feature: Feature }) =>
    z.object({ feature: z.enum(["flashcards", "ncert_highlights"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFeature(context.userId, data.feature);
    return { ok: true as const, charged: 0, free: true as const };
  });
