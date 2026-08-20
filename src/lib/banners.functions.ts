import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./admin-content.server";

export type BannerRow = {
  id: string;
  title: string | null;
  image_url: string;
  link_url: string | null;
  sort_order: number;
  active: boolean;
};

/** Public: only active banners, ordered for the dashboard slider. */
export const listActiveBanners = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await (supabaseAdmin as any)
    .from("dashboard_banners")
    .select("id,title,image_url,link_url,sort_order,active")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as BannerRow[];
});

/** Admin: every banner, active or not. */
export const adminListBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await (supabaseAdmin as any)
      .from("dashboard_banners")
      .select("id,title,image_url,link_url,sort_order,active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BannerRow[];
  });

export const adminUpsertBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().max(120).optional().nullable(),
        image_url: z.string().url().max(2000),
        link_url: z.string().url().max(2000).optional().nullable(),
        sort_order: z.number().int().min(0).max(9999).default(0),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      title: data.title?.trim() || null,
      image_url: data.image_url.trim(),
      link_url: data.link_url?.trim() || null,
      sort_order: data.sort_order,
      active: data.active,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await (supabaseAdmin as any)
        .from("dashboard_banners")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await (supabaseAdmin as any)
      .from("dashboard_banners")
      .insert(payload)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Failed to create banner");
    return { id: row.id as string };
  });

export const adminDeleteBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("dashboard_banners")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
