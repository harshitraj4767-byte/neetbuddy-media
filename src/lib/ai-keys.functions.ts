import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function assertAdmin(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

/**
 * Returns the best active Lovable AI key (oldest last_used wins so usage round-robins).
 * Falls back to env LOVABLE_API_KEY if no rows present.
 * Updates last_used_at on the picked row.
 * ONLY callable from server-side code (never exposed to client).
 */
function decodeStoredKey(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if (/^\\x[0-9a-fA-F]*$/.test(s)) {
      try { return Buffer.from(s.slice(2), "hex").toString("utf8").trim(); } catch { /* noop */ }
    }
    if (/^[\x20-\x7e]+$/.test(s) && s.length >= 8) return s;
    try {
      const dec = Buffer.from(s, "base64").toString("utf8").trim();
      if (/^[\x20-\x7e]+$/.test(dec) && dec.length >= 8) return dec;
    } catch { /* noop */ }
  }
  return "";
}

export async function getActiveAiKeys(): Promise<{ id: string | null; key: string }[]> {
  const supabaseAdmin = await getAdmin();
  const { data: rows } = await supabaseAdmin
    .from("ai_api_keys" as never)
    .select("id,key_encrypted,last_used_at")
    .eq("is_active", true)
    .order("last_used_at", { ascending: true, nullsFirst: true });
  const keys: { id: string | null; key: string }[] = [];
  for (const row of (rows ?? []) as Array<{ id: string; key_encrypted: unknown }>) {
    const decoded = decodeStoredKey(row.key_encrypted);
    if (decoded) keys.push({ id: row.id, key: decoded });
  }
  const env = process.env.LOVABLE_API_KEY;
  if (env) keys.push({ id: null, key: env });
  return keys;
}

async function markKeyUsed(id: string | null) {
  if (!id) return;
  try {
    const supabaseAdmin = await getAdmin();
    await supabaseAdmin
      .from("ai_api_keys" as never)
      .update({ last_used_at: new Date().toISOString() } as never)
      .eq("id", id);
  } catch { /* noop */ }
}

/** Call Lovable AI gateway with auto key rotation on 401/402/403/429/5xx. */
export async function callAiGatewayWithRotation(path: string, body: unknown): Promise<Response> {
  const keys = await getActiveAiKeys();
  if (keys.length === 0) {
    throw new Error("No AI API key configured. Add one in Admin → AI Keys or set LOVABLE_API_KEY.");
  }
  const url = `https://ai.gateway.lovable.dev${path}`;
  let lastErr = "";
  for (const k of keys) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${k.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { await markKeyUsed(k.id); return res; }
    const txt = await res.text().catch(() => "");
    lastErr = `AI gateway ${res.status}: ${txt.slice(0, 400)}`;
    if (res.status === 400) throw new Error(lastErr);
  }
  throw new Error(`All AI keys failed. Last error: ${lastErr}`);
}

export async function getActiveAiKey(): Promise<string> {
  const keys = await getActiveAiKeys();
  if (keys.length === 0) throw new Error("No AI API key configured. Add one in Admin → AI Keys.");
  await markKeyUsed(keys[0].id);
  return keys[0].key;
}


export const adminListAiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { data, error } = await supabaseAdmin
      .from("ai_api_keys" as never)
      .select("id,label,last_four,is_active,last_used_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminAddAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      label: z.string().trim().min(1).max(80),
      key: z.string().trim().min(8).max(2000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const hex = "\\x" + Buffer.from(data.key, "utf8").toString("hex");
    const last4 = data.key.slice(-4);
    const { error } = await supabaseAdmin
      .from("ai_api_keys" as never)
      .insert({
        label: data.label,
        key_encrypted: hex,
        last_four: last4,
        is_active: true,
        created_by: context.userId,
      } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { error } = await supabaseAdmin
      .from("ai_api_keys" as never)
      .update({ is_active: data.is_active } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { error } = await supabaseAdmin.from("ai_api_keys" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
