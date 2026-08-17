import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";
import { generateDailyDppsFromDb } from "@/lib/daily-dpp-db.functions";

export const Route = createFileRoute("/api/public/hooks/generate-daily-quiz")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let count = 1;
        try {
          const body = await request.json().catch(() => null);
          if (body && typeof body.count === "number") {
            count = Math.min(20, Math.max(1, Math.floor(body.count)));
          }
        } catch {/* ignore */}
        try {
          const result = await generateDailyDppsFromDb({ data: { count } });
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "daily-dpp-db",
            status: result.errors.length ? "partial" : "ok",
            details: { count, ...result },
          });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "daily-dpp-db",
            status: "error",
            details: { error: msg },
          }).then(() => undefined, () => undefined);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
