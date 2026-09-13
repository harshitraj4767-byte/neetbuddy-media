import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}


// -------- Auth: record review --------
export const recordFlashcardReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { card_id: string; rating: 1 | 2 | 3 }) =>
    z.object({
      card_id: z.string().uuid(),
      rating: z.number().int().min(1).max(3),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

// Cards live in flashcard_decks / flashcards (deck_id). There are no
// subject_id / chapter_id columns on flashcards, so admin generation resolves
// (or creates) one deck per chapter and writes cards against its deck_id.
type AdminDb = { from: (t: string) => any };

export const adminGenerateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { chapter_id: string; count?: number }) =>
    z.object({
      chapter_id: z.string().uuid(),
      count: z.number().int().min(5).max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);
    const db = supabaseAdmin as unknown as AdminDb;

    const ensureDeck = async (subject: string, title: string, description: string) => {
      const { data: found } = await db
        .from("flashcard_decks")
        .select("id")
        .eq("subject", subject)
        .eq("title", title)
        .maybeSingle();
      if (found?.id) return found.id as string;
      const { data: made, error } = await db
        .from("flashcard_decks")
        .insert({ subject, title, description, card_count: 0 })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return made.id as string;
    };

    const { data: ch, error: chErr } = await supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .eq("id", data.chapter_id)
      .maybeSingle();
    if (chErr || !ch) throw new Error("Chapter not found");
    const subjName = ((ch as any).subjects?.name as string) ?? "Science";
    const chName = (ch as any).name as string;
    const cards = await generateAiFlashcards(subjName, chName, (ch as any).class ?? 12, data.count ?? 20);
    if (cards.length === 0) throw new Error("AI returned no cards");

    const deckId = await ensureDeck(subjName, chName, `AI flashcards for ${chName}`);
    const rows = cards.map((c, i) => ({
      deck_id: deckId,
      front: c.front,
      back: c.back,
      difficulty: (c.difficulty ?? "Medium").toLowerCase(),
      source: "AI · NCERT",
      position: i,
    }));
    const { error: insErr } = await db.from("flashcards").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const { count: total } = await db
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("deck_id", deckId);
    await db.from("flashcard_decks").update({ card_count: total ?? rows.length }).eq("id", deckId);

    return { created: rows.length, chapter: chName };
  });

export const adminDeleteFlashcardsByChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { chapter_id: string }) =>
    z.object({ chapter_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);
    const db = supabaseAdmin as unknown as AdminDb;

    const { data: ch } = await supabaseAdmin
      .from("chapters")
      .select("id,name,subjects:subject_id(name)")
      .eq("id", data.chapter_id)
      .maybeSingle();
    if (!ch) throw new Error("Chapter not found");
    const { data: deck } = await db
      .from("flashcard_decks")
      .select("id")
      .eq("subject", ((ch as any).subjects?.name as string) ?? "Science")
      .eq("title", (ch as any).name)
      .maybeSingle();
    if (!deck?.id) return { deleted: 0 };

    const { error, count } = await db
      .from("flashcards")
      .delete({ count: "exact" })
      .eq("deck_id", deck.id);
    if (error) throw new Error(error.message);
    await db.from("flashcard_decks").update({ card_count: 0 }).eq("id", deck.id);
    return { deleted: count ?? 0 };
  });

export const adminListChaptersForFlashcards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
// Processes chapters that have no deck (or an empty deck), a few per call to
// stay within serverless time limits. Call repeatedly until `remaining` is 0.
export const adminGenerateFlashcardsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { subject_id?: string | null; per_chapter?: number; max_chapters?: number }) =>
    z.object({
      subject_id: z.string().uuid().nullable().optional(),
      per_chapter: z.number().int().min(5).max(40).optional(),
      max_chapters: z.number().int().min(1).max(8).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(context.userId);
    const db = supabaseAdmin as unknown as AdminDb;
    const per = data.per_chapter ?? 15;
    const batch = data.max_chapters ?? 4;

    let chQ = supabaseAdmin
      .from("chapters")
      .select("id,name,class,subject_id,subjects:subject_id(name)")
      .order("name", { ascending: true });
    if (data.subject_id) chQ = chQ.eq("subject_id", data.subject_id);
    const { data: chapters, error: chErr } = await chQ;
    if (chErr) throw new Error(chErr.message);

    const { data: deckRows } = await db
      .from("flashcard_decks")
      .select("id,title,subject,card_count");
    const decks = (deckRows ?? []) as Array<{ id: string; title: string; subject: string; card_count: number }>;
    const deckKey = (subject: string, title: string) => `${subject.toLowerCase()}|${title.toLowerCase()}`;
    const byKey = new Map(decks.map((d) => [deckKey(d.subject, d.title), d]));

    const pending = (chapters ?? []).filter((c: any) => {
      const deck = byKey.get(deckKey(c.subjects?.name ?? "Science", c.name));
      return !deck || (deck.card_count ?? 0) === 0;
    });

    const slice = pending.slice(0, batch);
    let created = 0;
    const results: { chapter: string; created: number }[] = [];
    for (const ch of slice as any[]) {
      try {
        const subjName = ch.subjects?.name ?? "Science";
        const cards = await generateAiFlashcards(subjName, ch.name, ch.class ?? 12, per);
        if (!cards.length) continue;

        let deckId = byKey.get(deckKey(subjName, ch.name))?.id;
        if (!deckId) {
          const { data: made, error } = await db
            .from("flashcard_decks")
            .insert({ subject: subjName, title: ch.name, description: `AI flashcards for ${ch.name}`, card_count: 0 })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          deckId = made.id as string;
        }
        const rows = cards.map((c, i) => ({
          deck_id: deckId,
          front: c.front,
          back: c.back,
          difficulty: (c.difficulty ?? "Medium").toLowerCase(),
          source: "AI · NCERT",
          position: i,
        }));
        const { error } = await db.from("flashcards").insert(rows);
        if (error) continue;
        const { count: total } = await db
          .from("flashcards")
          .select("id", { count: "exact", head: true })
          .eq("deck_id", deckId);
        await db.from("flashcard_decks").update({ card_count: total ?? rows.length }).eq("id", deckId);
        created += rows.length;
        results.push({ chapter: ch.name, created: rows.length });
      } catch (e) {
        console.error("bulk flashcards", ch.name, e);
      }
    }
    return {
      processed: slice.length,
      created,
      remaining: Math.max(0, pending.length - slice.length),
      results,
    };
  });
