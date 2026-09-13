import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from("app_settings" as never)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const v = (data as any)?.value;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const getAppSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("app_settings" as never)
    .select("key,value");
  const map: Record<string, unknown> = {};
  for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) map[r.key] = r.value;
  return {
    flashcards_cost: Number(map.flashcards_cost ?? 15),
    ncert_highlights_cost: Number(map.ncert_highlights_cost ?? 15),
    score_predictor_cost: Number(map.score_predictor_cost ?? 25),
    ai_path_cost: Number(map.ai_path_cost ?? 45),
  };
});

export const adminUpdateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { key: string; value: number }) =>
    z.object({
      key: z.enum([
        "flashcards_cost",
        "ncert_highlights_cost",
        "score_predictor_cost",
        "ai_path_cost",
      ]),
      value: z.number().int().min(0).max(10000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_settings" as never)
      .upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
