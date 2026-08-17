import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function scanDuplicates() {
  const all: { id: string; text: string; text_hash: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .select("id,text,text_hash,created_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const groups = new Map<string, string[]>();
  for (const q of all) {
    const key = (q.text_hash || q.text || "").trim().toLowerCase();
    if (!key) continue;
    const arr = groups.get(key);
    if (!arr) groups.set(key, []);
    else arr.push(q.id);
  }
  const dupIds: string[] = [];
  let groupCount = 0;
  for (const arr of groups.values()) {
    if (arr.length > 0) { dupIds.push(...arr); groupCount += 1; }
  }
  return { dupIds, groupCount };
}

export const Route = createFileRoute("/api/public/hooks/dedupe-questions")({
  server: {
    handlers: {
      POST: async () => {
        const r = await scanDuplicates();
        let deleted = 0;
        for (let i = 0; i < r.dupIds.length; i += 200) {
          const chunk = r.dupIds.slice(i, i + 200);
          const { error } = await supabaseAdmin.from("questions").delete().in("id", chunk);
          if (error) throw error;
          deleted += chunk.length;
        }
        await supabaseAdmin.from("cron_job_runs").insert({
          job_name: "dedupe-questions",
          status: "success",
          details: { deleted, groupCount: r.groupCount },
        });
        return new Response(JSON.stringify({ deleted, groupCount: r.groupCount }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
