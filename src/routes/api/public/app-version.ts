import { createFileRoute } from "@tanstack/react-router";
import { APP_VERSION } from "@/lib/app-version";

// Public read-only endpoint — returns the current deployed app version.
// Clients poll this to detect a new deploy and prompt for refresh.
export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ version: APP_VERSION }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        }),
    },
  },
});
