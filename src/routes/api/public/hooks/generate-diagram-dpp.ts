import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";
import { generateAiDiagramDpp } from "@/lib/ai-quiz.functions";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export const Route = createFileRoute("/api/public/hooks/generate-diagram-dpp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let count = 10;
        try {
          const body = await request.json().catch(() => null);
          if (body && typeof body.count === "number") count = Math.min(20, Math.max(5, Math.floor(body.count)));
        } catch {/* ignore */}
        try {
          const result = await generateAiDiagramDpp({ data: { count } });
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "diagram-dpp",
            status: "ok",
            details: { ...result, requested: count },
          });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "diagram-dpp",
            status: "error",
            details: { requested: count, error: msg },
          }).then(() => undefined, () => undefined);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
