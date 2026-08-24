import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

export type Highlight = {
  id: string;
  subject_id: string | null;
  chapter_id: string | null;
  body: string;
  source: string;
};

export const listHighlightDecks = createServerFn({ method: "GET" }).handler(async () => {
  const rows: Array<{ subject_id: string | null; chapter_id: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from("ncert_highlights" as never)
      .select("subject_id,chapter_id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as typeof rows;
    rows.push(...chunk);
    if (chunk.length < 1000) break;
    if (rows.length >= 200000) break;
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.subject_id ?? ""}::${r.chapter_id ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const { data: subjects } = await supabaseAdmin.from("subjects").select("id,name");
  const { data: chapters } = await supabaseAdmin.from("chapters").select("id,name,subject_id");
  const subjById = new Map<string, string>((subjects ?? []).map((s: any) => [s.id as string, s.name as string]));
  const chById = new Map((chapters ?? []).map((c: any) => [c.id, c]));

  const decks: { subject_id: string | null; subject_name: string; chapter_id: string | null; chapter_name: string; count: number }[] = [];
  for (const [key, count] of counts) {
    const [sid, cid] = key.split("::");
    const ch = cid ? (chById.get(cid) as any) : null;
    decks.push({
      subject_id: sid || null,
      subject_name: (sid && subjById.get(sid)) || "General",
      chapter_id: cid || null,
      chapter_name: ch?.name ?? "Mixed",
      count,
    });
  }
  decks.sort((a, b) => a.subject_name.localeCompare(b.subject_name) || a.chapter_name.localeCompare(b.chapter_name));
  return { decks, totalRows: rows.length };
});


export const getHighlights = createServerFn({ method: "POST" })
  .inputValidator((d: { chapter_id?: string | null; subject_id?: string | null }) =>
    z.object({
      chapter_id: z.string().uuid().nullable().optional(),
      subject_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const build = () => {
      let q = supabaseAdmin
        .from("ncert_highlights" as never)
        .select("id,subject_id,chapter_id,body,source")
        .order("created_at", { ascending: true });
      if (data.chapter_id) q = q.eq("chapter_id", data.chapter_id);
      else if (data.subject_id) q = q.eq("subject_id", data.subject_id);
      return q;
    };
    // No 200-row cap: page through every highlight for this chapter/subject.
    const PAGE = 1000;
    const rows: Highlight[] = [];
    for (let off = 0; off < 200000; off += PAGE) {
      const { data: page, error } = await build().range(off, off + PAGE - 1);
      if (error) throw new Error(error.message);
      const chunk = (page ?? []) as Highlight[];
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return { rows };
  });

// ----- Admin: manual add -----
export const adminAddHighlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chapter_id: string; body: string; source?: string }) =>
    z.object({
      chapter_id: z.string().uuid(),
      body: z.string().trim().min(3).max(4000),
      source: z.string().trim().max(80).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: ch } = await supabaseAdmin.from("chapters").select("id,subject_id").eq("id", data.chapter_id).maybeSingle();
    if (!ch) throw new Error("Chapter not found");
    const { error } = await supabaseAdmin.from("ncert_highlights" as never).insert({
      chapter_id: ch.id,
      subject_id: (ch as any).subject_id,
      body: data.body,
      source: data.source ?? "Manual",
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Admin: AI generate -----
const HL_SYSTEM = `You are a senior NEET-UG NCERT curator for Neet Buddy, targeting NEET 2026.
Your ONLY source is the current NCERT Class 11 & 12 textbook for the requested chapter. No coaching notes, no foreign textbooks, no paraphrased "extra facts".

Each highlight is a HIGH-YIELD NCERT line — the sentences that have historically been the source of NEET questions (2013–2025) or that NCERT itself marks as important (bold text, tables, "Note", "Important to remember", in-text boxes, table headings, and labelled-diagram legends).

Rules per highlight:
- 1–3 short sentences OR a tight bulleted list, <= 280 chars total.
- Quote the fact as close to NCERT wording as possible; never dilute values, units, or IUPAC names.
- Every number, unit, constant, and formula must match the current NCERT edition. Use LaTeX: $\\Delta H$, $\\text{kJ mol}^{-1}$, $K_{eq}$.
- No markdown headings, no images, no \`\`\`tikz/\`\`\`mermaid, no external references, no "as per…".
- No duplicates, no near-duplicates, no paraphrase-pairs.
- Cover: definitions → exceptions → numerical values → table entries → diagram labels → name reactions/laws → NEET-PYQ favourite lines.
- If a candidate highlight is NOT in NCERT for this chapter, DROP it. Prefer fewer, sharper highlights over filler.`;

export const adminGenerateHighlights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chapter_id: string; count?: number }) =>
    z.object({
      chapter_id: z.string().uuid(),
      count: z.number().int().min(5).max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: ch } = await supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .eq("id", data.chapter_id).maybeSingle();
    if (!ch) throw new Error("Chapter not found");
    const n = data.count ?? 15;
    const subjName = ((ch as any).subjects?.name as string) ?? "Science";

    const res = await callAiGatewayWithRotation("/v1/chat/completions", {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: HL_SYSTEM },
        { role: "user", content: `Subject: ${subjName}\nChapter: "${(ch as any).name}" — NCERT Class ${(ch as any).class ?? 12}\nTarget: NEET 2026.\n\nProduce ${n} unique high-yield NCERT highlights STRICTLY from this chapter — the exact NCERT lines, values, and table/diagram entries most likely to appear in NEET 2026. Prioritise lines historically seen in NEET PYQs 2013–2025. No paraphrase, no outside content.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "emit_highlights",
          parameters: {
            type: "object",
            properties: {
              highlights: {
                type: "array",
                items: { type: "object", properties: { body: { type: "string" } }, required: ["body"], additionalProperties: false },
              },
            },
            required: ["highlights"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_highlights" } },
    });
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no tool call");
    const parsed = JSON.parse(args) as { highlights: { body: string }[] };
    const items = (parsed.highlights ?? []).filter((c) => c?.body?.trim());
    if (items.length === 0) throw new Error("AI returned no highlights");

    const rows = items.map((h) => ({
      chapter_id: (ch as any).id,
      subject_id: (ch as any).subject_id,
      body: h.body.trim(),
      source: "AI · NCERT",
      created_by: context.userId,
    }));
    const { error } = await supabaseAdmin.from("ncert_highlights" as never).insert(rows as never);
    if (error) throw new Error(error.message);
    return { created: rows.length, chapter: (ch as any).name };
  });

export const adminDeleteHighlightsByChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chapter_id: string }) => z.object({ chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error, count } = await supabaseAdmin
      .from("ncert_highlights" as never)
      .delete({ count: "exact" })
      .eq("chapter_id", data.chapter_id);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export const adminDeleteHighlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("ncert_highlights" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Shared AI generation helper --------
async function generateAiHighlights(subjName: string, chapterName: string, klass: number, n: number): Promise<string[]> {
  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: HL_SYSTEM },
      { role: "user", content: `Subject: ${subjName}\nChapter: "${chapterName}" — NCERT Class ${klass}\nTarget: NEET 2026.\n\nProduce ${n} unique high-yield NCERT highlights STRICTLY from this chapter — exact NCERT lines / values / table entries. Prioritise NEET-PYQ favourite lines (2013–2025). No paraphrase, no outside content.` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_highlights",
        parameters: {
          type: "object",
          properties: {
            highlights: {
              type: "array",
              items: { type: "object", properties: { body: { type: "string" } }, required: ["body"], additionalProperties: false },
            },
          },
          required: ["highlights"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_highlights" } },
  });
  const j = await res.json();
  const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return [];
  const parsed = JSON.parse(args) as { highlights: { body: string }[] };
  return (parsed.highlights ?? []).map((h) => h?.body?.trim()).filter((b): b is string => !!b);
}

// -------- Admin: BULK generate highlights across chapters --------
// Only fills chapters that currently have no highlights. Call repeatedly until
// `remaining` is 0 to cover the whole syllabus without hitting time limits.
export const adminGenerateHighlightsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subject_id?: string | null; per_chapter?: number; max_chapters?: number }) =>
    z.object({
      subject_id: z.string().uuid().nullable().optional(),
      per_chapter: z.number().int().min(5).max(40).optional(),
      max_chapters: z.number().int().min(1).max(8).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const per = data.per_chapter ?? 12;
    const batch = data.max_chapters ?? 4;

    let chQ = supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .order("name", { ascending: true });
    if (data.subject_id) chQ = chQ.eq("subject_id", data.subject_id);
    const { data: chapters, error: chErr } = await chQ;
    if (chErr) throw new Error(chErr.message);

    const existing: Array<{ chapter_id: string | null }> = [];
    for (let off = 0; ; off += 1000) {
      const { data: page } = await supabaseAdmin.from("ncert_highlights" as never).select("chapter_id").range(off, off + 999);
      const chunk = (page ?? []) as typeof existing;
      existing.push(...chunk);
      if (chunk.length < 1000) break;
      if (existing.length >= 200000) break;
    }
    const populated = new Set(existing.map((r: any) => r.chapter_id).filter(Boolean));
    const pending = (chapters ?? []).filter((c: any) => !populated.has(c.id));

    const slice = pending.slice(0, batch);
    let created = 0;
    const results: { chapter: string; created: number }[] = [];
    for (const ch of slice as any[]) {
      try {
        const subjName = ch.subjects?.name ?? "Science";
        const bodies = await generateAiHighlights(subjName, ch.name, ch.class ?? 12, per);
        if (bodies.length) {
          const rows = bodies.map((body) => ({
            chapter_id: ch.id, subject_id: ch.subject_id,
            body, source: "AI · NCERT", created_by: context.userId,
          }));
          const { error } = await supabaseAdmin.from("ncert_highlights" as never).insert(rows as never);
          if (!error) { created += rows.length; results.push({ chapter: ch.name, created: rows.length }); }
        }
      } catch (e) { console.error("bulk highlights", ch.name, e); }
    }
    return {
      processed: slice.length,
      created,
      remaining: Math.max(0, pending.length - slice.length),
      results,
    };
  });
