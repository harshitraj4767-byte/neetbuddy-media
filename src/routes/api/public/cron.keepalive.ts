import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";

// Keeps the worker warm + logs a heartbeat row so you can see cron is alive.
export const Route = createFileRoute("/api/public/cron/keepalive")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const denied = await verifyCronRequest(request);
  if (denied) return denied;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("cron_job_runs")
      .insert({ job_name: "keepalive", status: "ok", details: { ts: new Date().toISOString() } })
      .then(() => undefined, () => undefined);
  } catch { /* table optional */ }

  return new Response(
    JSON.stringify({ ok: true, alive: true, ts: new Date().toISOString() }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
