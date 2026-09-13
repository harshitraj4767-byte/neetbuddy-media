import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./admin-content.server";

/**
 * Destination is stored as an in-app path (e.g. "/batches") so renames of the
 * public site or domain never break a banner. Absolute http(s) links are still
 * allowed for external campaigns.
 */
const destinationSchema = z
  .string()
  .max(2000)
  .trim()
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v),
    "Destination must be an in-app path like /batches or a full https link",
  );

export type BannerRow = {
  id: string;
  title: string | null;
  image_url: string;
  image_url_dark: string | null;
  link_url: string | null;
  sort_order: number;
  active: boolean;
};

/** Public: only active banners, ordered for the dashboard slider. */
export const listActiveBanners = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await (supabaseAdmin as any)
    .from("dashboard_banners")
    .select("id,title,image_url,image_url_dark,link_url,sort_order,active")
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
      .select("id,title,image_url,image_url_dark,link_url,sort_order,active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BannerRow[];
  });

export const adminUpsertBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().max(120).optional().nullable(),
        image_url: z.string().url().max(2000),
        image_url_dark: z.string().url().max(2000).optional().nullable(),
        link_url: destinationSchema.optional().nullable(),
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
      image_url_dark: data.image_url_dark?.trim() || null,
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
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("dashboard_banners")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Admin: hand back a signed upload URL so the browser can push the artwork
 * straight into the public `banner-images` bucket (no third-party host needed).
 */
export const adminCreateBannerUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ filename: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ext = (data.filename.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `banners/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("banner-images")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not create upload URL");
    const { data: pub } = supabaseAdmin.storage.from("banner-images").getPublicUrl(path);
    return { path, token: signed.token, public_url: pub.publicUrl };
  });
