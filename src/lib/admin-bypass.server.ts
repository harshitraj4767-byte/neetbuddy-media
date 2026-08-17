// Server-only helper: detect admin users so they bypass bonus-cost gates.
// Used by every feature-gate to grant admins effectively-infinite bonus.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cache = new Map<string, { v: boolean; t: number }>();
const TTL_MS = 60_000;

export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.t < TTL_MS) return hit.v;
  const { data } = await supabaseAdmin
    .from("user_roles" as never)
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  const v = !!data;
  cache.set(userId, { v, t: now });
  return v;
}
