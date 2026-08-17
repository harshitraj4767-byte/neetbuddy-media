import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";
import { tickOneUser } from "@/lib/infinite-run.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cron: ticks every running infinite_run row.
// Schedule this with pg_cron or external scheduler, calling:
//   POST https://<your-domain>/api/public/cron/infinite-run
//   header: x-cron-secret: <CRON_SECRET>

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401, headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/cron/infinite-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;


        const { data: runs } = await supabaseAdmin
          .from("infinite_runs" as never)
          .select("user_id")
          .eq("status", "running")
          .limit(50);

        const list = (runs ?? []) as Array<{ user_id: string }>;
        const results: any[] = [];
        for (const r of list) {
          try {
            results.push({ user_id: r.user_id, ...(await tickOneUser(r.user_id)) });
          } catch (e) {
            results.push({ user_id: r.user_id, status: "error", error: e instanceof Error ? e.message : String(e) });
          }
        }

        await supabaseAdmin.from("cron_job_runs").insert({
          job_name: "infinite-run",
          status: "ok",
          details: { processed: list.length, results },
        });

        return Response.json({ ok: true, processed: list.length, results });
      },
    },
  },
});
