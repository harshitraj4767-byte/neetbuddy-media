import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { avatarForName, NEETIQ_AVATARS } from "@/lib/neetiq-avatars";

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles" as never)
    .select("role")
    .eq("user_id", userId);
  if (!roles?.some((r: any) => r.role === "admin")) throw new Error("Admin only");
}

/** Pick from the curated NEETIQ avatar set based on the bot's name. */
function botIconUrl(iconKey: number, name?: string): string {
  if (name && name.trim()) return avatarForName(name);
  // Fallback: deterministic by iconKey
  return NEETIQ_AVATARS[(Math.max(1, iconKey) - 1) % NEETIQ_AVATARS.length];
}

export const adminListBattleBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("bg_bot_profiles" as never)
      .select("id,name,avatar_url,is_active,created_at,updated_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminAddBattleBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ name: z.string().trim().min(2).max(80), iconKey: z.number().int().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bg_bot_profiles" as never).upsert({
      name: data.name,
      avatar_url: botIconUrl(data.iconKey, data.name),
      is_active: true,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleBattleBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("bg_bot_profiles" as never)
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteBattleBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("bg_bot_profiles" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Bulk-insert bots from a newline / comma-separated list of names.
 * AI-free: avatar is chosen deterministically from the curated NEETIQ set
 * by hashing each bot's name.
 */
export const adminBulkAddBattleBots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ names: z.string().min(1).max(20000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const names = Array.from(
      new Set(
        data.names
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2 && s.length <= 80),
      ),
    );
    if (!names.length) return { ok: true, inserted: 0 };
    const rows = names.map((name) => ({
      name,
      avatar_url: avatarForName(name),
      is_active: true,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("bg_bot_profiles" as never)
      .upsert(rows as never, { onConflict: "name" });
    if (error) throw new Error(error.message);
    return { ok: true, inserted: rows.length };
  });