import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function ensureAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

const Media = z.array(z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url(),
})).default([]);

// Public: list featured selection results
export const listFeaturedSelections = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data, error } = await db
    .from("mentorship_selections")
    .select("id, student_name, exam_year, rank_text, college, story, media, sort_order, created_at")
    .eq("featured", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

// Admin: list all
export const adminListSelections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const db = await admin();
    const { data, error } = await db
      .from("mentorship_selections")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SelInput = z.object({
  id: z.string().uuid().optional(),
  student_name: z.string().min(1).max(120),
  exam_year: z.number().int().min(2000).max(2100).nullable().optional(),
  rank_text: z.string().max(120).nullable().optional(),
  college: z.string().max(200).nullable().optional(),
  story: z.string().max(4000).nullable().optional(),
  media: Media,
  featured: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const adminUpsertSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SelInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const db = await admin();
    const row = { ...data, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await db.from("mentorship_selections").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await db.from("mentorship_selections").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const adminDeleteSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const db = await admin();
    const { error } = await db.from("mentorship_selections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Signed upload URL for admins to upload media into selection-results bucket
export const adminCreateSelectionUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ filename: z.string().min(1).max(160), kind: z.enum(["image", "video"]) }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const db = await admin();
    const ext = data.filename.split(".").pop()?.toLowerCase() || (data.kind === "video" ? "mp4" : "jpg");
    const path = `selections/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await db.storage.from("selection-results").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    const { data: pub } = db.storage.from("selection-results").getPublicUrl(path);
    return { path, token: signed.token, public_url: pub.publicUrl };
  });