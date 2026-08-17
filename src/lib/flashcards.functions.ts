import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

export type Flashcard = {
  id: string;
  subject_id: string | null;
  chapter_id: string | null;
  front: string;
  back: string;
  difficulty: string;
  source: string;
};

// -------- Public: list decks (subject × chapter with counts) --------
export const listFlashcardDecks = createServerFn({ method: "GET" }).handler(async () => {
  // Page past Supabase's 1000-row default to get the FULL count, not capped at 1000.
  const rows: Array<{ subject_id: string | null; chapter_id: string | null }> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("flashcards" as never)
      .select("subject_id,chapter_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as typeof rows;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
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
  return { decks, totalCards: rows.length };
});


// -------- Public: fetch cards for a deck (or random) --------
export const getFlashcards = createServerFn({ method: "POST" })
  .inputValidator((d: { chapter_id?: string | null; subject_id?: string | null; limit?: number }) =>
    z.object({
      chapter_id: z.string().uuid().nullable().optional(),
      subject_id: z.string().uuid().nullable().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("flashcards" as never)
      .select("id,subject_id,chapter_id,front,back,difficulty,source");
    if (data.chapter_id) q = q.eq("chapter_id", data.chapter_id);
    else if (data.subject_id) q = q.eq("subject_id", data.subject_id);
    const { data: rows, error } = await q.limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Flashcard[];
    // shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return { cards: list };
  });

// -------- Auth: record review --------
export const recordFlashcardReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { card_id: string; rating: 1 | 2 | 3 }) =>
    z.object({
      card_id: z.string().uuid(),
      rating: z.number().int().min(1).max(3),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("flashcard_reviews" as never).insert({
      user_id: context.userId,
      card_id: data.card_id,
      rating: data.rating,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------- Admin: generate flashcards with AI --------
const FC_SYSTEM = `You are a senior NEET-UG author for Neet Buddy, targeting NEET 2026 aspirants.
Your only source of truth is the current NCERT textbook (Class 11 & 12) for the requested chapter. Do not use foreign textbooks, coaching notes, or non-NCERT terminology.

Card design (Anki-grade, spaced-repetition friendly):
- Every card is ATOMIC — one fact, one Q, one A. If a topic has 5 facts, that's 5 cards, not one card with 5 bullets.
- "front": a crisp recall prompt <= 140 chars. Prefer "Define…", "State…", "Give the value/formula of…", "Compare X vs Y (one line)…", or a cloze cue like "In {mitochondria}, the enzyme responsible for ATP synthesis is ___". Avoid vague "Explain about X".
- "back": the exact NCERT answer in 1–3 tight sentences OR ≤4 short bullets. Numbers, values, units, and IUPAC names MUST match the NCERT edition.
- Cover NEET-favourite angles for the chapter: definitions, exceptions, "important to remember" boxes, values in tables, labelled-diagram parts, name reactions, formulas, and NCERT in-text lines that repeatedly appear in NEET PYQs (2013–2025).
- Add a mnemonic ONLY when it is a well-known one (e.g. "VIBGYOR", "OIL RIG"); never invent forced mnemonics.
- Use LaTeX for every variable, formula, unit, subscript, superscript: $v=u+at$, $\\Delta H$, $\\text{kJ mol}^{-1}$, $K_{eq}$, $\\text{Fe}^{2+}$.

Hard rules:
- NCERT-only. If a fact is not in NCERT, DROP the card.
- No repeats, no near-duplicates, no reversed A/B duplicates.
- No markdown headings, no images, no diagrams, no \`\`\`tikz/\`\`\`mermaid, no external links.
- Difficulty mix: ~40% Easy (direct NCERT recall), ~40% Medium (application/inter-line), ~20% Hard (multi-concept / NEET-trap).
- Language: exam-formal English. No emojis, no "let's", no filler.`;

type AiCard = { front: string; back: string; difficulty?: "Easy" | "Medium" | "Hard" };

async function generateAiFlashcards(subjectName: string, chapterName: string, klass: number, n: number): Promise<AiCard[]> {
  const user = `Subject: ${subjectName}
Chapter: "${chapterName}" — NCERT Class ${klass}
Target exam: NEET 2026.

Produce ${n} unique, atomic flashcards STRICTLY from the NCERT ${subjectName} Class ${klass} chapter "${chapterName}". Every fact must be traceable to a specific NCERT line, table, or in-text box.

Coverage checklist (spread cards across):
1. Core definitions and NCERT in-line "important" statements.
2. All numerical values, constants, and units from the chapter's tables/figures.
3. Every exception, "note", or "remember" box.
4. Labelled parts of the chapter's diagrams (name + one-line function).
5. Formulas / equations / name reactions with their exact NCERT form.
6. High-frequency NEET-PYQ angles for THIS chapter (recall which lines have been asked repeatedly in NEET 2013–2025 and prioritise them).

Return only via the emit_flashcards tool. No prose, no preamble.`;

  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: FC_SYSTEM },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_flashcards",
        parameters: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  front: { type: "string" },
                  back: { type: "string" },
                  difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
                },
                required: ["front", "back"],
                additionalProperties: false,
              },
            },
          },
          required: ["cards"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_flashcards" } },
  });
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no tool call");
  const parsed = JSON.parse(args) as { cards: AiCard[] };
  return (parsed.cards ?? []).filter((c) => c.front && c.back);
}

export const adminGenerateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chapter_id: string; count?: number }) =>
    z.object({
      chapter_id: z.string().uuid(),
      count: z.number().int().min(5).max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: ch, error: chErr } = await supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .eq("id", data.chapter_id)
      .maybeSingle();
    if (chErr || !ch) throw new Error("Chapter not found");
    const subjName = ((ch as any).subjects?.name as string) ?? "Science";
    const cards = await generateAiFlashcards(subjName, (ch as any).name, (ch as any).class ?? 12, data.count ?? 20);
    if (cards.length === 0) throw new Error("AI returned no cards");

    const rows = cards.map((c) => ({
      subject_id: (ch as any).subject_id,
      chapter_id: (ch as any).id,
      front: c.front,
      back: c.back,
      difficulty: (c.difficulty ?? "Medium").toLowerCase(),
      source: "AI · NCERT",
      created_by: context.userId,
    }));
    const { error: insErr } = await supabaseAdmin.from("flashcards" as never).insert(rows as any);
    if (insErr) throw new Error(insErr.message);
    return { created: rows.length, chapter: (ch as any).name };
  });

export const adminDeleteFlashcardsByChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chapter_id: string }) =>
    z.object({ chapter_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error, count } = await supabaseAdmin
      .from("flashcards" as never)
      .delete({ count: "exact" })
      .eq("chapter_id", data.chapter_id);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export const adminListChaptersForFlashcards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      class: c.class,
      subject_id: c.subject_id,
      subject_name: c.subjects?.name ?? "General",
    }));
  });

// -------- Admin: BULK generate flashcards across chapters --------
// Processes chapters that currently have no flashcards, a few per call to stay
// within serverless time limits. Call repeatedly until `remaining` is 0.
export const adminGenerateFlashcardsBulk = createServerFn({ method: "POST" })
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
    const per = data.per_chapter ?? 15;
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
      const { data: page } = await supabaseAdmin.from("flashcards" as never).select("chapter_id").range(off, off + 999);
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
        const cards = await generateAiFlashcards(subjName, ch.name, ch.class ?? 12, per);
        if (cards.length) {
          const rows = cards.map((c) => ({
            subject_id: ch.subject_id, chapter_id: ch.id,
            front: c.front, back: c.back,
            difficulty: (c.difficulty ?? "Medium").toLowerCase(),
            source: "AI · NCERT", created_by: context.userId,
          }));
          const { error } = await supabaseAdmin.from("flashcards" as never).insert(rows as any);
          if (!error) { created += rows.length; results.push({ chapter: ch.name, created: rows.length }); }
        }
      } catch (e) { console.error("bulk flashcards", ch.name, e); }
    }
    return {
      processed: slice.length,
      created,
      remaining: Math.max(0, pending.length - slice.length),
      results,
    };
  });
