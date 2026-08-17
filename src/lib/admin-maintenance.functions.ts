// Admin batch-job server fns:
//   - insertProjectLovableKey: inserts process.env.LOVABLE_API_KEY into ai_api_keys
//   - backfillDiagrams: scan questions referencing diagrams/graphs without a question_diagrams row, generate AI PNGs (watermarked via renderDiagramPng)
//   - cleanupIrrelevantBio: AI-flag biology numerical / off-syllabus questions, auto-delete the high-confidence ones
// All are admin-only via requireSupabaseAuth + has_role check.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";
import { renderDiagramPng } from "@/lib/ai-quiz.functions";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function assertAdmin(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r: any) => r.role === "admin")) throw new Error("Admin only");
}

// ── 1) Insert project LOVABLE_API_KEY into ai_api_keys ───────────────────────
export const insertProjectLovableKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not set on the server");
    const supabaseAdmin = await getAdmin();
    const last4 = key.slice(-4);
    // Skip if already present
    const { data: existing } = await supabaseAdmin
      .from("ai_api_keys")
      .select("id")
      .eq("last_four", last4)
      .maybeSingle();
    if (existing) return { ok: true, skipped: true, message: "Project key already in the table" };
    const hex = "\\x" + Buffer.from(key, "utf8").toString("hex");
    const { error } = await supabaseAdmin.from("ai_api_keys").insert({
      label: "Project Lovable Key",
      key_encrypted: hex,
      last_four: last4,
      is_active: true,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, skipped: false };
  });

// ── 2) Diagram backfill ─────────────────────────────────────────────────────
const DIAGRAM_REGEX = /(diagram|figure|fig\.|graph|plot|axes?|labelled|shown in|in the figure|the given figure|the curve|the graph|circuit|ray diagram|labelled part|labelled diagram)/i;
const HAS_IMAGE_REGEX = /!\[diagram\]|\/api\/public\/diagram\//i;

export const backfillDiagrams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();

    // Fetch a window of recent questions. We can't filter regex server-side cleanly,
    // so we over-fetch then filter in JS.
    const { data: candidates, error } = await supabaseAdmin
      .from("questions")
      .select("id,text")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const needed = (candidates ?? []).filter(
      (q: any) =>
        typeof q.text === "string" &&
        DIAGRAM_REGEX.test(q.text) &&
        !HAS_IMAGE_REGEX.test(q.text),
    );

    // Skip ones that already have a diagram row
    const ids = needed.map((q: any) => q.id);
    const { data: existing } = ids.length
      ? await supabaseAdmin.from("question_diagrams").select("question_id").in("question_id", ids)
      : { data: [] };
    const have = new Set((existing ?? []).map((r: any) => r.question_id));
    const todo = needed.filter((q: any) => !have.has(q.id)).slice(0, data.limit);

    let generated = 0;
    const errors: string[] = [];
    for (const q of todo) {
      try {
        const prompt = `Based on this NEET MCQ question, render the diagram/graph it refers to as a clean NCERT-style textbook line drawing. Label parts as (P)(Q)(R)(S) where the question references them. Question text:\n\n${String(q.text).slice(0, 800)}`;
        const b64 = await renderDiagramPng(prompt);
        const { data: diagRow, error: dErr } = await supabaseAdmin
          .from("question_diagrams")
          .insert({
            question_id: q.id,
            mime: "image/png",
            data: `\\x${Buffer.from(b64, "base64").toString("hex")}`,
            prompt,
          })
          .select("id")
          .single();
        if (dErr || !diagRow) throw dErr ?? new Error("diagram insert failed");
        const url = `/api/public/diagram/${diagRow.id}.png`;
        const newText = `![diagram](${url})\n\n${q.text}`;
        await supabaseAdmin.from("questions").update({ text: newText }).eq("id", q.id);
        generated++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { scanned: candidates?.length ?? 0, needsDiagram: needed.length, generated, remaining: Math.max(0, needed.length - have.size - generated), errors: errors.slice(0, 5) };
  });

// ── 3) Irrelevant biology question cleanup (AI classifier, auto-delete high-confidence) ──
export const cleanupIrrelevantBio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();

    // Find biology subjects
    const { data: subjects } = await supabaseAdmin
      .from("subjects")
      .select("id,name")
      .or("name.ilike.%biology%,name.ilike.%botany%,name.ilike.%zoology%");
    const subjectIds = (subjects ?? []).map((s: any) => s.id);
    if (subjectIds.length === 0) return { scanned: 0, deleted: 0, kept: 0, errors: ["No biology subjects found"] };

    const { data: rows, error } = await supabaseAdmin
      .from("questions")
      .select("id,text,options")
      .in("subject_id", subjectIds)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    let deleted = 0;
    let kept = 0;
    const errors: string[] = [];
    for (const q of rows ?? []) {
      try {
        const prompt = `You are a strict NEET-UG biology syllabus auditor. Decide if this biology question is IRRELEVANT for NEET (e.g. pure physics-style numerical with no biological context, off-syllabus, nonsensical, or duplicate boilerplate). Respond JSON only: {"irrelevant": true|false, "confidence": 0..1, "reason": "..."}.\n\nQUESTION:\n${q.text}\nOPTIONS: ${JSON.stringify(q.options)}`;
        const res = await callAiGatewayWithRotation("/v1/chat/completions", {
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        const j = await res.json();
        const raw = j?.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(typeof raw === "string" ? raw : "{}");
        if (parsed.irrelevant === true && Number(parsed.confidence) >= 0.85) {
          await supabaseAdmin.from("questions").delete().eq("id", q.id);
          deleted++;
        } else {
          kept++;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    await supabaseAdmin.from("admin_actions").insert({
      user_id: context.userId,
      action: "cleanup_irrelevant_bio",
      target: null,
      meta: { scanned: rows?.length ?? 0, deleted, kept },
    });
    return { scanned: rows?.length ?? 0, deleted, kept, errors: errors.slice(0, 5) };
  });
