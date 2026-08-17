import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/diagram/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id || "").replace(/\.png$/i, "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("question_diagrams")
          .select("data,mime")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return new Response("not found", { status: 404 });
        // bytea comes back as `\x...` hex string from PostgREST
        const hex = String((data as { data: string }).data).replace(/^\\x/, "");
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": (data as { mime: string }).mime || "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
