import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      rating: z.number().int().min(1).max(5),
      category: z.enum(["bug", "idea", "other"]).default("other"),
      message: z.string().trim().min(3).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (supabaseAdmin as any).from("feedback").insert({
      user_id: context.userId,
      rating: data.rating,
      category: data.category,
      message: data.message,
    });
    if (error) throw new Error(`Could not save feedback: ${error.message}`);
    return { ok: true };
  });
