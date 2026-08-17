// Admin: AI-driven syllabus/relevance scan for questions.
// NOTE: uses type assertions because generated Supabase types are refreshed
// separately from live schema. Runtime schema is confirmed by the migration.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, logAdminAction } from "./admin-content.server";
import { getActiveAiKey } from "@/lib/ai-keys.functions";

// Loose alias to bypass stale generated types for new tables/columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as unknown as any;

type ScanVerdict = {
  question_id: string;
  in_syllabus: boolean;
  relevant: boolean;
  reason: "out_of_syllabus" | "irrelevant" | "factually_wrong" | "ambiguous" | "ok";
  severity: "low" | "medium" | "high";
  detail: string;
};

async function callGeminiJudge(payload: unknown, apiKey: string): Promise<ScanVerdict[]> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
          "You are the NEET UG 2026 syllabus auditor (NCERT Class 11 & 12 Physics, Chemistry, Biology). For each question decide whether it is inside the NEET syllabus AND relevant to the given chapter. Answer strictly as JSON: {\"verdicts\":[{question_id, in_syllabus:boolean, relevant:boolean, reason:'out_of_syllabus'|'irrelevant'|'factually_wrong'|'ambiguous'|'ok', severity:'low'|'medium'|'high', detail:string}]}. Only flag when confident." },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ai_gateway_${res.status}: ${await res.text()}`);
  const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { verdicts?: ScanVerdict[] };
  return parsed.verdicts ?? [];
}

export const scanQuestionsForSyllabus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      subjectId: z.string().uuid().optional(),
      chapterId: z.string().uuid().optional(),
      limit: z.number().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const apiKey = await getActiveAiKey();

    let q = supabaseAdmin
      .from("questions")
      .select("id,text,options,correct_index,chapter_id,subject_id,chapters:chapter_id(name,class),subjects:subject_id(name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    else if (data.subjectId) q = q.eq("subject_id", data.subjectId);

    const { data: qs, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (qs ?? []) as unknown as Array<{
      id: string; text: string; options: string[]; correct_index: number;
      chapters?: { name?: string; class?: number } | null;
      subjects?: { name?: string } | null;
    }>;

    const payload = rows.map((r) => ({
      question_id: r.id,
      subject: r.subjects?.name ?? "",
      chapter: r.chapters?.name ?? "",
      class: r.chapters?.class ?? null,
      text: r.text,
      options: r.options,
      correct: r.options?.[r.correct_index] ?? "",
    }));

    let inserted = 0;
    for (let i = 0; i < payload.length; i += 20) {
      const chunk = payload.slice(i, i + 20);
      let verdicts: ScanVerdict[] = [];
      try { verdicts = await callGeminiJudge({ items: chunk }, apiKey); }
      catch (e) { console.error("[scan] chunk failed", e); continue; }

      const flags = verdicts
        .filter((v) => !v.in_syllabus || !v.relevant || v.reason === "factually_wrong" || v.reason === "ambiguous")
        .map((v) => ({
          question_id: v.question_id,
          reason: !v.in_syllabus ? "out_of_syllabus"
                 : !v.relevant ? "irrelevant"
                 : v.reason === "factually_wrong" ? "factually_wrong"
                 : "ambiguous",
          severity: v.severity ?? "medium",
          detail: v.detail ?? "",
          ai_verdict: v as unknown as Record<string, unknown>,
        }));
      if (flags.length) {
        const { error: insErr } = await db.from("question_flags").insert(flags);
        if (!insErr) inserted += flags.length;
      }
    }
    await logAdminAction(context.userId, "scan_syllabus", data.chapterId ?? data.subjectId ?? "all", { scanned: payload.length, flagged: inserted });
    return { scanned: payload.length, flagged: inserted };
  });

export const listQuestionFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.enum(["open","approved_keep","deleted","ignored"]).default("open"), limit: z.number().min(1).max(200).default(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const q = db.from("question_flags")
      .select("id,question_id,reason,severity,detail,status,created_at,questions:question_id(text,options,correct_index,chapter_id,subject_id,chapters:chapter_id(name),subjects:subject_id(name))")
      .eq("status", data.status)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    const { data: rows, error } = await (q as unknown as Promise<{ data: unknown; error: { message: string } | null }>);
    if (error) throw new Error(error.message);
    // Return JSON-serialized string to bypass strict serializable typegen.
    return { rowsJson: JSON.stringify(rows ?? []) };
  });

export const resolveQuestionFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    flagId: z.string().uuid(),
    action: z.enum(["delete","approve_keep","ignore"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: flagRaw } = await db.from("question_flags").select("id,question_id").eq("id", data.flagId).maybeSingle();
    const flag = flagRaw as { id: string; question_id: string } | null;
    if (!flag) throw new Error("Flag not found");

    if (data.action === "delete") {
      await supabaseAdmin.from("questions").delete().eq("id", flag.question_id);
      await db.from("question_flags").update({ status: "deleted", resolved_at: new Date().toISOString(), resolved_by: context.userId }).eq("id", flag.id);
    } else {
      const status = data.action === "approve_keep" ? "approved_keep" : "ignored";
      await db.from("question_flags").update({ status, resolved_at: new Date().toISOString(), resolved_by: context.userId }).eq("id", flag.id);
    }
    await logAdminAction(context.userId, `flag_${data.action}`, flag.question_id, {});
    return { ok: true };
  });

export const attachQuestionDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    questionId: z.string().uuid(),
    diagramUrl: z.string().url().optional(),
    imagePrompt: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.diagramUrl) {
      const { data: currentRaw } = await db.from("questions").select("attachments").eq("id", data.questionId).maybeSingle();
      const current = currentRaw as { attachments?: Record<string, unknown> | null } | null;
      const attachments = current?.attachments ?? {};
      (attachments as Record<string, unknown>).diagram_url = data.diagramUrl;
      patch.attachments = attachments;
    }
    if (data.imagePrompt) patch.image_prompt = data.imagePrompt;
    const { error } = await db.from("questions").update(patch).eq("id", data.questionId);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "attach_diagram", data.questionId, {});
    return { ok: true };
  });
