import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./admin-content.server";

export const listMockCategories = createServerFn({ method: "GET" }).handler(async () => {
  const admin = supabaseAdmin as any;
  const { data } = await admin
    .from("mock_categories")
    .select("id,name,sort_order,active")
    .order("sort_order", { ascending: true });
  return (data ?? []) as Array<{ id: string; name: string; sort_order: number; active: boolean }>;
});

export const adminUpsertMockCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(64),
      sort_order: z.number().int().min(0).max(9999).default(0),
      active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = { name: data.name.trim(), sort_order: data.sort_order, active: data.active, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await (supabaseAdmin as any).from("mock_categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (supabaseAdmin as any).from("mock_categories").insert(payload).select("id").maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Failed to create category");
    return { id: row.id as string };
  });

export const adminDeleteMockCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any).from("mock_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetTestCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ test_id: z.string().uuid(), category_id: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any).from("tests").update({ category_id: data.category_id }).eq("id", data.test_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
