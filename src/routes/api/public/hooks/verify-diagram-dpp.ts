import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";
import { generateDiagramVerifyDpp } from "@/lib/ai-quiz.functions";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

// One-shot 5-question diagram-DPP verification endpoint.
// Proves the full pipeline: text → image_prompt → gemini-3-pro-image
// → PNG in DB → question row → test row → served at /api/public/diagram/{id}.png
// Returns per-step trace so the admin can verify every diagram was created.
export const Route = createFileRoute("/api/public/hooks/verify-diagram-dpp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;

        try {
          const result = await generateDiagramVerifyDpp();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});