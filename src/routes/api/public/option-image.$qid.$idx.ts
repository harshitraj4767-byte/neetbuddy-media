import { createFileRoute } from "@tanstack/react-router";

// Serves an image bound to a specific option of a question.
// URL: /api/public/option-image/{questionId}/{optionIndex}
export const Route = createFileRoute("/api/public/option-image/$qid/$idx")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const qid = String(params.qid || "").replace(/\.png$/i, "");
        const idx = Number(params.idx);
        if (!/^[0-9a-f-]{36}$/i.test(qid)) return new Response("bad qid", { status: 400 });
        if (!Number.isInteger(idx) || idx < 0 || idx > 10) return new Response("bad idx", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;
        const { data, error } = await admin
          .from("question_option_images")
          .select("data,mime")
          .eq("question_id", qid)
          .eq("option_index", idx)
          .maybeSingle();
        if (error || !data) return new Response("not found", { status: 404 });
        const hex = String(data.data).replace(/^\\x/, "");
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": data.mime || "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
