// Shared cron-endpoint auth helper. Accepts either `x-cron-secret` header
// or `Authorization: Bearer <secret>`. Uses timing-safe comparison.
//
// The expected secret comes from `process.env.CRON_SECRET`. Because a
// published build only receives the secrets that existed at deploy time, we
// also fall back to the `public._cron_config` table (same value pg_cron uses)
// so scheduled jobs keep working right after a secret is added/rotated.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

let cachedDbSecret: { value: string; at: number } | null = null;

async function dbSecret(): Promise<string> {
  if (cachedDbSecret && Date.now() - cachedDbSecret.at < 60_000) return cachedDbSecret.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { value?: string } | null }> };
        };
      };
    })
      .from("_cron_config")
      .select("value")
      .eq("key", "secret")
      .maybeSingle();
    const value = String(data?.value ?? "").trim();
    cachedDbSecret = { value, at: Date.now() };
    return value;
  } catch {
    return "";
  }
}

export async function verifyCronRequest(request: Request): Promise<Response | null> {
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const provided = headerSecret || bearer;

  const expected = (process.env.CRON_SECRET ?? "").trim() || (await dbSecret());
  if (!expected) {
    return new Response(JSON.stringify({ error: "cron_secret_missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
