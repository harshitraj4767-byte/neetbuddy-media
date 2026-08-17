import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActiveAiKey } from "@/lib/ai-keys.functions";

type ReportRow = {
  id: string;
  question_id: string;
  reason: string;
  details: string | null;
};
type QuestionRow = {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
};

async function verifyOne(q: QuestionRow, reports: ReportRow[]): Promise<{ bad: boolean; verdict: unknown }> {
  const apiKey = await getActiveAiKey();
  const userMsg = `You are a strict NEET-grade question reviewer. Decide if the following MCQ is FACTUALLY WRONG, ambiguous, has wrong correct answer, or has duplicate/no-correct options. Reply with a JSON tool call.

QUESTION:
${q.text}

OPTIONS:
${q.options.map((o, i) => `${i}. ${o}`).join("\n")}

MARKED CORRECT INDEX: ${q.correct_index}
EXPLANATION: ${q.explanation ?? "(none)"}

USER REPORTS:
${reports.map((r) => `- reason: ${r.reason}; details: ${r.details ?? ""}`).join("\n")}

Return verdict.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an exam-grade MCQ reviewer. Be strict but fair." },
        { role: "user", content: userMsg },
      ],
      tools: [{
        type: "function",
        function: {
          name: "verdict",
          description: "Return a verdict about a reported MCQ.",
          parameters: {
            type: "object",
            properties: {
              is_bad: { type: "boolean", description: "true if the question must be deleted" },
              category: {
                type: "string",
                enum: ["factually_wrong", "wrong_correct_answer", "duplicate_options", "no_correct_option", "ambiguous", "ok"],
              },
              reasoning: { type: "string" },
            },
            required: ["is_bad", "category", "reasoning"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "verdict" } },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const json = await res.json();
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const verdict = args ? JSON.parse(args) : { is_bad: false, category: "ok", reasoning: "no verdict" };
  return { bad: !!verdict.is_bad, verdict };
}

export const Route = createFileRoute("/api/public/hooks/verify-reported-questions")({
  server: {
    handlers: {
      POST: async () => {
        const summary = { processed: 0, deleted: 0, kept: 0, errors: [] as string[] };
        try {
          const { data: pending, error } = await supabaseAdmin
            .from("question_reports")
            .select("id,question_id,reason,details")
            .eq("status", "pending")
            .limit(50);
          if (error) throw new Error(error.message);

          const byQ = new Map<string, ReportRow[]>();
          for (const r of (pending ?? []) as ReportRow[]) {
            const arr = byQ.get(r.question_id) ?? [];
            arr.push(r);
            byQ.set(r.question_id, arr);
          }

          for (const [qid, reports] of byQ.entries()) {
            summary.processed += reports.length;
            try {
              const { data: q } = await supabaseAdmin
                .from("questions")
                .select("id,text,options,correct_index,explanation")
                .eq("id", qid)
                .maybeSingle();
              if (!q) {
                await supabaseAdmin
                  .from("question_reports")
                  .update({ status: "deleted", ai_verdict: { reason: "question already missing" }, reviewed_at: new Date().toISOString() })
                  .in("id", reports.map((r) => r.id));
                continue;
              }
              const { bad, verdict } = await verifyOne(q as QuestionRow, reports);
              if (bad) {
                await supabaseAdmin.from("questions").delete().eq("id", qid);
                await supabaseAdmin
                  .from("question_reports")
                  .update({ status: "verified_bad", ai_verdict: verdict as any, reviewed_at: new Date().toISOString() })
                  .in("id", reports.map((r) => r.id));
                summary.deleted += 1;
              } else {
                await supabaseAdmin
                  .from("question_reports")
                  .update({ status: "rejected", ai_verdict: verdict as any, reviewed_at: new Date().toISOString() })
                  .in("id", reports.map((r) => r.id));
                summary.kept += 1;
              }
            } catch (e) {
              summary.errors.push(`${qid}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          await supabaseAdmin.from("cron_job_runs").insert({
            job_name: "verify-reported-questions",
            status: summary.errors.length ? "partial" : "ok",
            details: summary,
          });
          return Response.json({ ok: true, ...summary });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg, ...summary }, { status: 500 });
        }
      },
    },
  },
});
