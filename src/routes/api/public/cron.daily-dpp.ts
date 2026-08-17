import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";
import { generateDailyDppsFromDb } from "@/lib/daily-dpp-db.functions";

export const Route = createFileRoute("/api/public/cron/daily-dpp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;

        let count = 1;
        try {
          const body = (await request.json().catch(() => ({}))) as { count?: number };
          if (typeof body?.count === "number") count = Math.min(Math.max(body.count, 1), 20);
        } catch { /* empty body ok */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const out = await generateDailyDppsFromDb({ data: { count } });
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "daily-dpp",
            status: out.errors?.length ? "partial" : "ok",
            details: { requested: count, ...out },
          }).then(() => undefined, () => undefined);
          return new Response(JSON.stringify({ ok: true, ...out }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "daily-dpp",
            status: "error",
            details: { requested: count, error: msg },
          }).then(() => undefined, () => undefined);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
