import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ReportSchema = z.object({
  question_id: z.string().uuid(),
  reason: z.string().min(3).max(120),
  details: z.string().max(2000).optional(),
});

export const reportQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ReportSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("question_reports").upsert(
      {
        question_id: data.question_id,
        user_id: userId,
        reason: data.reason,
        details: data.details ?? null,
      },
      { onConflict: "question_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
