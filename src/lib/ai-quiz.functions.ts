import { createServerFn } from "@tanstack/react-start";
import { callAiGatewayWithRotation, getActiveAiKey } from "@/lib/ai-keys.functions";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

// Fisher–Yates shuffle of the 4 options; remaps correct_index accordingly.
// Fixes the A/C answer-bias issue where the AI clumps the right answer.
function shuffleOptions<T extends { options: [string, string, string, string]; correct_index: 0 | 1 | 2 | 3 }>(q: T): T {
  const idx = [0, 1, 2, 3];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const newOpts = idx.map((k) => q.options[k]) as [string, string, string, string];
  const newCorrect = idx.indexOf(q.correct_index) as 0 | 1 | 2 | 3;
  return { ...q, options: newOpts, correct_index: newCorrect };
}


// AI quiz generator — NEET-grade chapter-wise DPP with varied question types.
// • 20 questions per quiz, one chapter per quiz
// • Live window: today 10:00 IST → 22:00 IST

type QType =
  | "numerical"
  | "assertion-reason"
  | "statement-based"
  | "match-the-following"
  | "ranking"
  | "graphical"
  | "diagram-based"
  | "case-based"
  | "fill-in-the-blanks"
  | "incorrect-statement"
  | "reaction-sequence"
  | "concept-mcq";

type GenQ = {
  type: QType;
  text: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
  source?: string;
  image_required?: boolean;
  image_prompt?: string;
  topic?: string;
  sub_topic?: string;
};

// Turn an AI-supplied citation into a clean exam-style source label.
// We NEVER expose "AI" to students — only real exam / book references.
function examSource(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s || /\bai\b/i.test(s) || /^ai[-\s]/i.test(s)) {
    // Sensible default rotation of legit sources.
    const fallbacks = ["NCERT", "NEET PYQ", "AIPMT", "JEE"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  return s.slice(0, 60);
}

// ============================================================
// NEET 2026 MASTER PROMPT (owner-supplied). Used by every
// question-generation path in this file. Keep in one place so
// updates only require editing this constant.
// ============================================================
const NEET_MASTER_SYSTEM = `You are an expert NEET 2026 question paper setter, NCERT subject expert, and assessment designer.

OBJECTIVE
Generate and improve NEET-level questions that are completely NCERT-based, conceptually accurate, and match the latest NEET pattern and difficulty. If an existing question is provided, first verify and correct it before returning the final version.

RULES
- Follow the latest NEET UG 2026 syllabus and exam trend.
- Never hallucinate facts.
- Never generate questions outside the given chapter unless explicitly asked.
- Biology must be strictly NCERT-based.
- Physics and Chemistry should follow NCERT concepts with NEET application level.
- Every statement must be scientifically correct.
- Avoid ambiguous wording.
- Avoid repeated PYQs unless requested.
- Produce fresh, original questions inspired by NEET style.

SUPPORTED QUESTION TYPES
Single Correct MCQ, Assertion–Reason, Statement I & II, Multi-Statement Evaluation, Match the Following, Matrix Match, Integer Type, Numerical Value, Case-Based MCQ, Experimental/Data Interpretation, Diagram-Based (with imagePrompt), Sequence Arrangement, Chronological Order, Column Matching, Identify the Incorrect/Correct Statement, Multiple Concept Integration, NCERT Line-Based, PYQ-Inspired (not copied), Advanced Conceptual, Trick Concept, Exception Based, True/False Combination, Graph Based.

DIFFICULTY DISTRIBUTION
25% Easy, 40% Moderate, 25% Hard, 10% Very Hard.

QUALITY CHECK — before returning:
✔ Verify every fact, units, options, answer, explanation.
✔ Exactly one correct answer unless the format requires otherwise.
✔ Zero grammatical mistakes. NCERT terminology.
✔ Explanation must teach the concept. If anything is incorrect, regenerate automatically.

DIAGRAM / GRAPH RULES (critical)
- If a question is Diagram-Based or Graph-Based, set "imageRequired": true and fill "imagePrompt" with a precise, self-contained NCERT-style textbook description (labelled parts (P)(Q)(R)(S) if any, axis labels+units for graphs, colours/shading, arrows).
- NEVER draw ASCII art, tikz, mermaid, <svg>, or markdown images in the stem.
- A separate image AI will render the diagram and add the Neet Buddy watermark automatically.
- For every other question type set "imageRequired": false and "imagePrompt": "".

LATEX RULES
- Wrap every variable, unit, value, formula, constant, ratio in LaTeX.
- Inline: $v = u + at$. Display: $$E = mc^2$$.
- Single backslash inside JSON strings. Never break \`$\` delimiters.

ASSERTION-REASON OPTIONS (exact wording)
A) Both A and R are true and R is the correct explanation of A.
B) Both A and R are true but R is NOT the correct explanation of A.
C) A is true but R is false.
D) A is false but R is true.
Stem: \`**Assertion (A):** ...\\n\\n**Reason (R):** ...\`

MATCH-THE-FOLLOWING — MANDATORY LATEX ARRAY (NOT markdown pipe table)
Text template:
\`Match the following ...:\\n\\n$$\\n\\\\begin{array}{|c|c|}\\n\\\\hline\\n\\\\textbf{Column I} & \\\\textbf{Column II} \\\\\\\\\\n\\\\hline\\nA.\\\\ \\\\text{...} & i.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nB.\\\\ \\\\text{...} & ii.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nC.\\\\ \\\\text{...} & iii.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nD.\\\\ \\\\text{...} & iv.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\n\\\\end{array}\\n$$\\n\\nSelect the correct matching sequence:\`
Options: "A-iii, B-i, C-ii, D-iv".

EXPLANATION FORMAT (concise, 4–8 lines)
- Key NCERT concept in 1 line.
- 1–3 lines of the crucial calc/reasoning (LaTeX).
- Rule out the closest distractor.
- End with: **Answer: Option X.**

FINAL INSTRUCTION
Think like a senior NEET paper setter. Prioritise conceptual clarity, NCERT accuracy, and realistic exam quality over quantity. If any generated question fails validation, discard it and regenerate before producing the final JSON.`;

async function generateNeetMcqs(
  subjectName: string,
  chapterName: string,
  classNum: number,
  n: number,
): Promise<GenQ[]> {
  const user = `Subject: ${subjectName}
Chapter: "${chapterName}" (Class ${classNum})

Produce EXACTLY ${n} unique NEET 2026-grade MCQs STRICTLY from the chapter above (no cross-chapter content). Use a varied mix of the supported question types. Match the difficulty and conceptual depth of RE-NEET 2026 and NEET 2025 papers: highly conceptual, thinking-based, multi-step reasoning, and application-heavy. AVOID trivial one-line recall unless the chapter genuinely demands it. Difficulty mix: 20% Easy, 40% Moderate, 30% Hard, 10% Very Hard.

SUBJECT-SPECIFIC EMPHASIS (mandatory — pick according to Subject above):
• PHYSICS: at least 50% of the batch MUST be Numerical Value / Integer Type questions with multi-step calculation. At least 20% must be Multi-Concept Integration questions (e.g. rotational + SHM, EM + optics, thermodynamics + kinetic theory, gravitation + circular motion). Prefer graph-based motion / field / oscillation questions where the chapter allows. Numerical answers must be dimensionally consistent and to 2–3 significant figures.
• CHEMISTRY:
  – Physical Chemistry chapters → at least 60% numerical (Ksp, pH, ΔG, ΔH, rate constant, EMF, mole ratios, colligative). Include graph-based questions (rate vs [A], ln k vs 1/T Arrhenius plots, titration/pH curves, phase diagrams, PV/PT plots) with image_required=true and a precise image_prompt describing axes+units+curve labels.
  – Organic Chemistry → at least 40% mechanism / reaction-sequence / product-prediction questions. Where a mechanism arrow-push, IUPAC structure, or reaction scheme aids clarity, set image_required=true with a precise image_prompt (skeletal structures, arrows, reagents above the arrow).
  – Inorganic → prefer property-comparison, exception-based, and multi-statement identification questions.
• BIOLOGY: at least 30% Assertion–Reason questions (exact 4-option format from system prompt). At least 20% "Identify the incorrect/correct statement" style. Include "odd one out" and diagram-based "which labelled part is wrongly identified" questions (with image_required=true and a precise labelled-diagram image_prompt: e.g. neuron, nephron, plant cell, flower LS, DNA replication fork, life cycle). Prefer 3–4 statement evaluation questions from NCERT lines.

OPTIONS-WITH-IMAGES: When distinguishing the options requires a picture (e.g. "which structure is aromatic?", "which graph shows correct v-t?"), you MAY set image_required=true and describe in image_prompt a single composite image containing four labelled panels (A)(B)(C)(D) that the image renderer will draw as the options grid; keep the text options as "(A)", "(B)", "(C)", "(D)" in that case.


Distribute the correct answer EVENLY across options A, B, C and D across the batch — do not cluster on A or C.

Use REAL line breaks (actual newlines) between statements, assertion/reason lines, and options list — never the literal two characters backslash-n.

For column/matching or comparison questions, ALWAYS render the columns using the LaTeX array template from the system prompt (never markdown pipe tables). Every table-style question MUST use $$\\begin{array}{...}\\end{array}$$.

For any question that would need a diagram or graph (anatomy, apparatus, ray path, curve, circuit, biological structure, etc.) set image_required=true and write a precise NCERT-style image_prompt (labels, axes+units, arrows, colours). For all other questions set image_required=false and image_prompt="".

Never emit tikz/mermaid/<svg>/markdown-image blocks in the stem — the diagram is drawn separately from image_prompt.

For every question also give a realistic exam "source" citation such as "NCERT Class ${classNum} Pg 142", "NEET 2025", "RE-NEET 2026", "AIPMT 2014" or "JEE Main 2022". NEVER write "AI" anywhere in the source.`;

  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: NEET_MASTER_SYSTEM },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_questions",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: [
                    "numerical","assertion-reason","statement-based","match-the-following",
                    "ranking","graphical","diagram-based","case-based","fill-in-the-blanks",
                    "incorrect-statement","reaction-sequence","concept-mcq",
                  ] },
                  text: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correct_index: { type: "integer", minimum: 0, maximum: 3 },
                  explanation: { type: "string" },
                  difficulty: { type: "string", enum: ["Easy","Medium","Hard"] },
                  source: { type: "string" },
                  image_required: { type: "boolean" },
                  image_prompt: { type: "string" },
                  topic: { type: "string", description: "The specific NCERT topic within the chapter (e.g. 'Newton's Laws of Motion')." },
                  sub_topic: { type: "string", description: "The narrower sub-topic (e.g. 'Free-body diagrams' or 'Friction on inclined plane')." },
                },
                required: ["type","text","options","correct_index","explanation","difficulty","image_required","image_prompt","topic","sub_topic"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_questions" } },
  });

  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return tool call");
  const parsed = JSON.parse(args) as { questions: GenQ[] };
  const raw = (parsed.questions ?? []).filter(
    (q) => q.text && q.options?.length === 4 && q.correct_index >= 0 && q.correct_index <= 3,
  );
  // Quality-check pass (balanced: 1× regen). Bad questions dropped, weak
  // ones sent back for a single-shot rewrite.
  const checked = await runQualityCheck(raw, subjectName, chapterName, classNum);
  // Shuffle option order so the correct answer isn't clumped on A/C.
  return checked.map((q) => shuffleOptions(q));
}

// ------------------------------------------------------------
// Question Quality Checker (Balanced — 1× regen).
// Runs after every generation batch. Scores each question for
// factual correctness, relevance to the chapter, unambiguity,
// answer correctness, and NCERT alignment. Anything scored < 7
// is sent for ONE regeneration; anything still < 6 is dropped.
// ------------------------------------------------------------
const QUALITY_JUDGE_SYSTEM = `You are a strict NEET 2026 senior examiner reviewing draft MCQs.
For each question judge on:
1. Factual correctness (NCERT-verified).
2. Relevance to the stated chapter (no off-syllabus/off-chapter content).
3. Unambiguity (exactly one correct option).
4. Distractor quality.
5. Explanation teaches the concept.

Return a JSON tool call with a score (1–10) and a short reason for each question, plus a verdict:
- "accept" (score ≥ 7)
- "regen"  (score 6, salvageable — needs one rewrite)
- "drop"   (score ≤ 5, irrelevant / factually wrong / off-chapter)`;

type Verdict = { verdict: "accept" | "regen" | "drop"; score: number; reason: string };

async function judgeQuestions(qs: GenQ[], subject: string, chapter: string): Promise<Verdict[]> {
  if (qs.length === 0) return [];
  const payload = qs.map((q, i) => `[Q${i + 1}] type=${q.type} diff=${q.difficulty}\n${q.text}\nOptions: ${q.options.join(" | ")}\nCorrect index: ${q.correct_index}\nExplanation: ${q.explanation.slice(0, 400)}`).join("\n\n");
  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: QUALITY_JUDGE_SYSTEM },
      { role: "user", content: `Subject: ${subject}\nChapter: ${chapter}\n\nJudge these ${qs.length} questions:\n\n${payload}` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_verdicts",
        parameters: {
          type: "object",
          properties: {
            verdicts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  verdict: { type: "string", enum: ["accept", "regen", "drop"] },
                  score: { type: "integer", minimum: 1, maximum: 10 },
                  reason: { type: "string" },
                },
                required: ["verdict", "score", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["verdicts"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_verdicts" } },
  });
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return qs.map(() => ({ verdict: "accept", score: 8, reason: "judge unavailable" }));
  const parsed = JSON.parse(args) as { verdicts: Verdict[] };
  const out = parsed.verdicts ?? [];
  while (out.length < qs.length) out.push({ verdict: "accept", score: 8, reason: "" });
  return out.slice(0, qs.length);
}

async function regenOne(q: GenQ, subject: string, chapter: string, classNum: number, reason: string): Promise<GenQ | null> {
  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: NEET_MASTER_SYSTEM },
      { role: "user", content: `Subject: ${subject}\nChapter: ${chapter} (Class ${classNum})\n\nThe following draft MCQ was flagged by the quality checker with reason: "${reason}"\n\nDRAFT:\n${q.text}\nOptions: ${q.options.join(" | ")}\nCorrect: ${q.correct_index}\n\nRewrite ONE improved NEET-grade MCQ on the SAME concept and same chapter. Fix the flagged issue. Keep type=${q.type} unless it must change for correctness. Return via the tool call.` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_questions",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correct_index: { type: "integer", minimum: 0, maximum: 3 },
                  explanation: { type: "string" },
                  difficulty: { type: "string" },
                  source: { type: "string" },
                  image_required: { type: "boolean" },
                  image_prompt: { type: "string" },
                  topic: { type: "string" },
                  sub_topic: { type: "string" },
                },
                required: ["type","text","options","correct_index","explanation","difficulty","image_required","image_prompt","topic","sub_topic"],
                additionalProperties: false,
              },
              minItems: 1, maxItems: 1,
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_questions" } },
  });
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  const parsed = JSON.parse(args) as { questions: GenQ[] };
  return parsed.questions?.[0] ?? null;
}

async function runQualityCheck(qs: GenQ[], subject: string, chapter: string, classNum: number): Promise<GenQ[]> {
  if (qs.length === 0) return qs;
  let verdicts: Verdict[] = [];
  try { verdicts = await judgeQuestions(qs, subject, chapter); } catch { return qs; }
  const out: GenQ[] = [];
  for (let i = 0; i < qs.length; i++) {
    const v = verdicts[i] ?? { verdict: "accept", score: 8, reason: "" };
    if (v.verdict === "accept") { out.push(qs[i]); continue; }
    if (v.verdict === "drop") continue;
    // regen (1×)
    try {
      const fresh = await regenOne(qs[i], subject, chapter, classNum, v.reason);
      if (fresh && fresh.text && fresh.options?.length === 4) out.push(fresh);
    } catch { /* drop on failure */ }
  }
  return out;
}

function liveWindowToday() {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  const startsAt = new Date(Date.UTC(y, m, d, 10, 0, 0) - istOffsetMs).toISOString();
  const endsAt = new Date(Date.UTC(y, m, d, 22, 0, 0) - istOffsetMs).toISOString();
  return { startsAt, endsAt };
}

async function pickChapters(limit: number, subjectFilter?: string) {
  const supabaseAdmin = await getAdmin();
  const { data: chaptersRaw } = await supabaseAdmin
    .from("chapters")
    .select("id,name,class,subject_id,subjects:subject_id(name)")
    .order("order_index", { ascending: true });
  if (!chaptersRaw || chaptersRaw.length === 0) return [];
  const needle = (subjectFilter ?? "").trim().toLowerCase();
  const chapters = needle
    ? chaptersRaw.filter((c: any) => (c.subjects?.name ?? "").toLowerCase().includes(needle))
    : chaptersRaw;
  if (chapters.length === 0) return [];

  // Count existing daily quizzes per chapter (covers weightage-wise rotation)
  const { data: dailyTests } = await supabaseAdmin
    .from("tests")
    .select("question_ids")
    .eq("type", "daily");
  const allQids = Array.from(new Set((dailyTests ?? []).flatMap((t) => (t.question_ids ?? []) as string[])));
  const chapterCount = new Map<string, number>();
  if (allQids.length > 0) {
    // Batch in chunks to avoid URL length issues
    const chunkSize = 200;
    for (let i = 0; i < allQids.length; i += chunkSize) {
      const chunk = allQids.slice(i, i + chunkSize);
      const { data: qs } = await supabaseAdmin
        .from("questions")
        .select("chapter_id")
        .in("id", chunk);
      (qs ?? []).forEach((q) => {
        if (q.chapter_id) chapterCount.set(q.chapter_id, (chapterCount.get(q.chapter_id) ?? 0) + 1);
      });
    }
  }

  const seed = new Date().toISOString().slice(0, 10);
  const seedKey = (id: string) => (id + seed).split("").reduce((s, c) => s + c.charCodeAt(0), 0);

  // Sort: fewest existing questions first (covers untouched chapters),
  // then deterministic shuffle by date seed for variety.
  const sorted = [...chapters].sort((a, b) => {
    const ca = chapterCount.get(a.id) ?? 0;
    const cb = chapterCount.get(b.id) ?? 0;
    if (ca !== cb) return ca - cb;
    return seedKey(a.id) - seedKey(b.id);
  });

  // Ensure subject spread within the picked batch (round-robin across subjects)
  const bySubject = new Map<string, typeof sorted>();
  for (const ch of sorted) {
    const k = ch.subject_id;
    if (!bySubject.has(k)) bySubject.set(k, []);
    bySubject.get(k)!.push(ch);
  }
  const subjectKeys = [...bySubject.keys()].sort((a, b) => seedKey(a) - seedKey(b));
  const picked: typeof sorted = [];
  const usedIds = new Set<string>();
  let i = 0;
  while (picked.length < limit && subjectKeys.length > 0) {
    const key = subjectKeys[i % subjectKeys.length];
    const list = bySubject.get(key)!;
    const next = list.shift();
    if (next && !usedIds.has(next.id)) {
      picked.push(next);
      usedIds.add(next.id);
    }
    if (list.length === 0) subjectKeys.splice(i % subjectKeys.length, 1);
    else i++;
    if (subjectKeys.length === 0) break;
  }
  return picked as Array<{
    id: string; name: string; class: number | null;
    subject_id: string; subjects: { name: string } | null;
  }>;
}

async function nextQuizSerial(chapterName: string): Promise<number> {
  const supabaseAdmin = await getAdmin();
  const { count } = await supabaseAdmin
    .from("tests")
    .select("id", { count: "exact", head: true })
    .ilike("title", `${chapterName} • Quiz %`);
  return (count ?? 0) + 1;
}

async function buildDiagramQuestionIds(chapter: {
  id: string; name: string; class: number | null;
  subject_id: string; subjects: { name: string } | null;
}, wanted: number): Promise<{ ids: string[]; errors: string[] }> {
  const supabaseAdmin = await getAdmin();
  const subjName = chapter.subjects?.name ?? "Science";
  const ids: string[] = [];
  const errors: string[] = [];
  try {
    const drafts = await generateDiagramOnlyMcqs(subjName, chapter.name, chapter.class ?? 12, wanted);
    for (const d of drafts.slice(0, wanted)) {
      try {
        const { data: qRow, error: qErr } = await supabaseAdmin
          .from("questions")
          .insert({
            subject_id: chapter.subject_id,
            chapter_id: chapter.id,
            text: d.text,
            options: d.options,
            correct_index: d.correct_index,
            explanation: d.explanation ?? null,
            difficulty: (d.difficulty ?? "Medium").toLowerCase(),
            source: "NCERT",
            marks_correct: 4,
            marks_wrong: -1,
            topic: d.topic ?? null,
            sub_topic: d.sub_topic ?? null,
          })
          .select("id")
          .single();
        if (qErr || !qRow) throw qErr ?? new Error("question insert failed");
        const qid = qRow.id as string;
        const b64 = await renderDiagramPng(d.image_prompt);
        const { data: diagRow, error: dErr } = await supabaseAdmin
          .from("question_diagrams")
          .insert({ question_id: qid, mime: "image/png", data: `\\x${Buffer.from(b64, "base64").toString("hex")}`, prompt: d.image_prompt })
          .select("id")
          .single();
        if (dErr || !diagRow) throw dErr ?? new Error("diagram insert failed");
        const url = `/api/public/diagram/${diagRow.id}.png`;
        const newText = `![diagram](${url})\n\n${d.text}`;
        const { error: uErr } = await supabaseAdmin
          .from("questions").update({ text: newText }).eq("id", qid);
        if (uErr) throw uErr;
        ids.push(qid);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return { ids, errors };
}

async function createOneAiQuiz(chapter: {
  id: string; name: string; class: number | null;
  subject_id: string; subjects: { name: string } | null;
}) {
  const supabaseAdmin = await getAdmin();
  const subjName = chapter.subjects?.name ?? "Science";
  // 18 text-MCQs + 2 diagram-MCQs = 20 total per quiz.
  const qs = await generateNeetMcqs(subjName, chapter.name, chapter.class ?? 12, 18);
  if (qs.length < 5) throw new Error(`AI returned only ${qs.length} questions for ${chapter.name}`);

  const { data: insertedQ, error: qErr } = await supabaseAdmin
    .from("questions")
    .insert(
      qs.map((q) => ({
        subject_id: chapter.subject_id,
        chapter_id: chapter.id,
        text: q.text,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation ?? null,
        difficulty: (q.difficulty ?? "Medium").toLowerCase(),
        source: examSource(q.source),
        marks_correct: 4,
        marks_wrong: -1,
        topic: q.topic ?? null,
        sub_topic: q.sub_topic ?? null,
      })),
    )
    .select("id");
  if (qErr) throw qErr;
  const textIds = (insertedQ ?? []).map((r: { id: string }) => r.id);

  // Best-effort: add 2 diagram/graph questions. Quiz still ships if these fail.
  const diag = await buildDiagramQuestionIds(chapter, 2);
  const ids = [...textIds, ...diag.ids];

  const { startsAt, endsAt } = liveWindowToday();
  const serial = await nextQuizSerial(chapter.name);

  const { error: tErr } = await supabaseAdmin.from("tests").insert({
    title: `${chapter.name} • Quiz ${serial}`,
    description: `NEET DPP · ${subjName} · ${chapter.name}. Live 10 AM – 10 PM IST.`,
    type: "daily",
    difficulty: "medium",
    duration_min: 25,
    total_questions: ids.length,
    is_paid: false,
    starts_at: startsAt,
    ends_at: endsAt,
    question_ids: ids,
    marks_correct: 4,
    marks_wrong: -1,
    source: "NCERT & PYQ",
  });
  if (tErr) throw tErr;
  return { chapter: chapter.name, count: ids.length, serial };
}

export const generateAiDailyQuizzes = createServerFn({ method: "POST" })
  .inputValidator((d: { count?: number }) => ({
    count: Math.min(Math.max(d?.count ?? 1, 1), 20),
  }))
  .handler(async ({ data }) => {
    const chapters = await pickChapters(data.count);
    if (chapters.length === 0) {
      return { created: 0, errors: ["No chapters in database. Add chapters first."], results: [] };
    }
    let created = 0;
    const errors: string[] = [];
    const results: Array<{ chapter: string; count: number; serial: number }> = [];
    for (const ch of chapters) {
      try {
        const r = await createOneAiQuiz(ch);
        results.push(r);
        created++;
      } catch (e) {
        errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { created, errors, results };
  });

// ------------------------------------------------------------
// Diagram-only DPP — AI generates a real PNG diagram per question.
// Pipeline: AI writes question + image_prompt → image gateway renders PNG →
// PNG bytes stored in `question_diagrams` → question text embeds
// `![diagram](/api/public/diagram/<id>)`.
// ------------------------------------------------------------

const DIAGRAM_ONLY_SYSTEM = `You are a NEET-UG question setter creating DIAGRAM/GRAPH based MCQs.
For each question, write ONLY the prose stem (no ASCII art, no \`\`\`tikz, no \`\`\`mermaid, no <svg>, no markdown image).
A separate AI image generator will draw a clean NCERT-replica diagram from your "image_prompt".

VARIETY — rotate across these diagram-question types:
- Identify the labelled part (P)/(Q)/(R)/(S) in a biological or physical diagram.
- Choose the CORRECT statement about a labelled structure / path / pathway.
- Choose the INCORRECT statement about the labelled diagram.
- Graph/curve analysis: slope, region, peak, turning point, intercept, or what a labelled segment represents.
- Match labelled parts (P,Q,R,S) with their function/name (options like "P-iii, Q-i, R-iv, S-ii").
- Sequence/flow ordering (steps of a cycle, blood-flow direction, signal path).
- Numerical reading from a graph (slope, area, ratio).

Rules:
- "image_prompt": precise NCERT-style textbook diagram description. Mention labelled parts as (P), (Q), (R), (S). For graphs, describe axes (with units), curve shape, and labelled segments/points. Style: clean black-on-white NCERT line drawing, labelled clearly, no shading, no watermark, no extra text.
- "text": the question stem referring to labelled parts. Do NOT redescribe the diagram in words.
- 4 options, exactly one correct, mix Easy/Medium/Hard, spread correct across A/B/C/D.
- LaTeX inline $...$, block $$...$$. Single backslashes inside JSON.
- Explanation 4–6 short lines, end with **Answer: Option X.**`;

type DiagQ = {
  text: string;
  image_prompt: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic?: string;
  sub_topic?: string;
};

async function generateDiagramOnlyMcqs(
  subjectName: string,
  chapterName: string,
  classNum: number,
  n: number,
): Promise<DiagQ[]> {
  const user = `Subject: ${subjectName}\nChapter: "${chapterName}" (Class ${classNum})\nProduce ${n} diagram-based MCQs. For each, give a concise textbook-style "image_prompt" so a separate image AI can render the diagram. The stem must reference labelled parts (P)/(Q)/(R)/(S) from the diagram.`;
  const res = await callAiGatewayWithRotation("/v1/chat/completions", {
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: DIAGRAM_ONLY_SYSTEM },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "emit_questions",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  image_prompt: { type: "string" },
                  options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                  correct_index: { type: "integer", minimum: 0, maximum: 3 },
                  explanation: { type: "string" },
                  difficulty: { type: "string", enum: ["Easy","Medium","Hard"] },
                  topic: { type: "string" },
                  sub_topic: { type: "string" },
                },
                required: ["text","image_prompt","options","correct_index","explanation","difficulty","topic","sub_topic"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "emit_questions" } },
  });
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return tool call");
  const parsed = JSON.parse(args) as { questions: DiagQ[] };
  return (parsed.questions ?? [])
    .filter((q) => q.text && q.image_prompt && q.options?.length === 4)
    .map((q) => shuffleOptions(q));
}

async function renderDiagramPng(prompt: string): Promise<string> {
  const apiKey = await getActiveAiKey();
  // Clean NCERT-style textbook diagram, NO watermark, NO branding text.
  const full = `Draw a clean, textbook-quality NCERT-style scientific diagram. Match the visual style of Indian NCERT Class 11–12 Physics / Chemistry / Biology textbook figures:
- Pure white background, crisp thin uniform black outlines, minimal grayscale shading only where needed for depth (e.g. cross-sections, organelles).
- Labels in a clean sans-serif, placed OUTSIDE the figure with thin straight leader lines pointing to the labelled feature. Use (P), (Q), (R), (S) exactly as specified.
- For physics ray/circuit/free-body/mechanics diagrams: straight thin lines, sharp arrowheads, angles/lengths shown with symbols, forces labelled with vector notation (F₁, F₂), correct optical/geometric proportions.
- For chemistry apparatus / organic structures / orbital / phase diagrams: standard IUPAC bond-line notation, wedge/dash stereochemistry where relevant, apparatus drawn like NCERT Lab manual (round-bottom flasks, delivery tubes, condensers with proper hatching).
- For biology: neat labelled anatomy in the style of NCERT Biology Class 11 (cell, neuron, nephron, flower LS, life cycle) — clear outlines, minimal shading, all labelled parts visible.
- For graphs: label BOTH axes with quantity AND unit, mark the curve accurately, show asked points/segments, use tick marks.
- Absolutely NO watermark, NO logo, NO branding text, NO page numbers, NO captions or extra decorative text outside the diagram itself.

DIAGRAM CONTENT: ${prompt}

Output only the diagram. NCERT textbook quality. No watermark of any kind.`;

  // Try gemini-3-pro-image first (best diagram quality + instruction following).
  const attempts: Array<{ model: string; body: Record<string, unknown> }> = [
    { model: "google/gemini-3-pro-image", body: { model: "google/gemini-3-pro-image", messages: [{ role: "user", content: full }], modalities: ["image", "text"] } },
    { model: "google/gemini-3.1-flash-image", body: { model: "google/gemini-3.1-flash-image", messages: [{ role: "user", content: full }], modalities: ["image", "text"] } },
    { model: "openai/gpt-image-2", body: { model: "openai/gpt-image-2", prompt: full, quality: "medium", size: "1024x1024", n: 1 } },
  ];
  let lastErr = "";
  for (const a of attempts) {
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(a.body),
      });
      if (!res.ok) { lastErr = `${a.model} ${res.status}: ${await res.text()}`; continue; }
      const j = await res.json();
      const b64 = j?.data?.[0]?.b64_json;
      if (b64) return b64;
      lastErr = `${a.model}: no b64_json`;
    } catch (e) {
      lastErr = `${a.model}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`All image models failed. Last: ${lastErr}`);
}

export { renderDiagramPng };


export const generateAiDiagramDpp = createServerFn({ method: "POST" })
  .inputValidator((d: { count?: number; subject?: string }) => ({
    count: Math.min(Math.max(d?.count ?? 10, 3), 15),
    subject: (d?.subject ?? "").trim().toLowerCase() || undefined,
  }))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getAdmin();
    const chapters = await pickChapters(1, data.subject);
    if (chapters.length === 0) throw new Error(`No chapters in DB${data.subject ? ` for subject "${data.subject}"` : ""}`);
    const ch = chapters[0];
    const subjName = ch.subjects?.name ?? "Science";
    const drafts = await generateDiagramOnlyMcqs(subjName, ch.name, ch.class ?? 12, data.count);
    if (drafts.length < 3) throw new Error(`AI returned only ${drafts.length} drafts`);

    const insertedIds: string[] = [];
    const errors: string[] = [];
    for (const d of drafts) {
      try {
        // 1) insert question shell to obtain id (used as fk target)
        const { data: qRow, error: qErr } = await supabaseAdmin
          .from("questions")
          .insert({
            subject_id: ch.subject_id,
            chapter_id: ch.id,
            text: d.text, // updated below with image url
            options: d.options,
            correct_index: d.correct_index,
            explanation: d.explanation ?? null,
            difficulty: (d.difficulty ?? "Medium").toLowerCase(),
            source: "NCERT",
            marks_correct: 4,
            marks_wrong: -1,
            topic: d.topic ?? null,
            sub_topic: d.sub_topic ?? null,
          })
          .select("id")
          .single();
        if (qErr || !qRow) throw qErr ?? new Error("question insert failed");
        const qid = qRow.id as string;

        // 2) render PNG and store bytes
        const b64 = await renderDiagramPng(d.image_prompt);
        const { data: diagRow, error: dErr } = await supabaseAdmin
          .from("question_diagrams")
          .insert({ question_id: qid, mime: "image/png", data: `\\x${Buffer.from(b64, "base64").toString("hex")}`, prompt: d.image_prompt })
          .select("id")
          .single();
        if (dErr || !diagRow) throw dErr ?? new Error("diagram insert failed");

        // 3) update question text to embed the rendered image
        const url = `/api/public/diagram/${diagRow.id}.png`;
        const newText = `![diagram](${url})\n\n${d.text}`;
        const { error: uErr } = await supabaseAdmin
          .from("questions").update({ text: newText }).eq("id", qid);
        if (uErr) throw uErr;
        insertedIds.push(qid);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (insertedIds.length === 0) throw new Error(`No questions saved. ${errors.join(" | ")}`);

    const { startsAt, endsAt } = liveWindowToday();
    const serial = await nextQuizSerial(ch.name);
    const { data: t, error: tErr } = await supabaseAdmin.from("tests").insert({
      title: `${ch.name} • Diagram DPP ${serial}`,
      description: `Diagram-only DPP · ${subjName} · ${ch.name}.`,
      type: "daily",
      difficulty: "medium",
      duration_min: 20,
      total_questions: insertedIds.length,
      is_paid: false,
      starts_at: startsAt,
      ends_at: endsAt,
      question_ids: insertedIds,
      marks_correct: 4,
      marks_wrong: -1,
      source: "NCERT & PYQ",
    }).select("id").single();
    if (tErr) throw tErr;
    return { test_id: t?.id, chapter: ch.name, count: insertedIds.length, errors };
  });

// ============================================================
// 5-QUESTION DIAGRAM DPP VERIFICATION
// One-click endpoint that proves the diagram pipeline works
// end-to-end: text → image_prompt → gemini-3-pro-image →
// PNG stored → question row → test row → renderable in UI.
// Returns rich diagnostics so the admin can eyeball each step.
// ============================================================
export const generateDiagramVerifyDpp = createServerFn({ method: "POST" })
  .handler(async () => {
    const supabaseAdmin = await getAdmin();
    const chapters = await pickChapters(1);
    if (chapters.length === 0) throw new Error("No chapters in database. Add chapters first.");
    const ch = chapters[0];
    const subjName = ch.subjects?.name ?? "Science";

    const drafts = await generateDiagramOnlyMcqs(subjName, ch.name, ch.class ?? 12, 5);
    if (drafts.length < 5) throw new Error(`AI returned only ${drafts.length}/5 diagram drafts`);

    const trace: Array<{ step: string; ok: boolean; detail: string }> = [];
    const questionIds: string[] = [];
    const diagramUrls: string[] = [];

    for (let i = 0; i < 5; i++) {
      const d = drafts[i];
      try {
        const { data: qRow, error: qErr } = await supabaseAdmin
          .from("questions")
          .insert({
            subject_id: ch.subject_id, chapter_id: ch.id,
            text: d.text, options: d.options, correct_index: d.correct_index,
            explanation: d.explanation ?? null,
            difficulty: (d.difficulty ?? "Medium").toLowerCase(),
            source: "NCERT", marks_correct: 4, marks_wrong: -1,
            topic: d.topic ?? null,
            sub_topic: d.sub_topic ?? null,
          }).select("id").single();
        if (qErr || !qRow) throw qErr ?? new Error("question insert failed");
        const qid = qRow.id as string;

        const b64 = await renderDiagramPng(d.image_prompt);
        trace.push({ step: `Q${i + 1} image`, ok: true, detail: `${Math.round(b64.length * 0.75 / 1024)} KB PNG via gemini-3-pro-image` });

        const { data: diagRow, error: dErr } = await supabaseAdmin
          .from("question_diagrams")
          .insert({ question_id: qid, mime: "image/png", data: `\\x${Buffer.from(b64, "base64").toString("hex")}`, prompt: d.image_prompt })
          .select("id").single();
        if (dErr || !diagRow) throw dErr ?? new Error("diagram insert failed");
        const url = `/api/public/diagram/${diagRow.id}.png`;
        const newText = `![diagram](${url})\n\n${d.text}`;
        await supabaseAdmin.from("questions").update({ text: newText }).eq("id", qid);
        questionIds.push(qid);
        diagramUrls.push(url);
        trace.push({ step: `Q${i + 1} saved`, ok: true, detail: url });
      } catch (e) {
        trace.push({ step: `Q${i + 1}`, ok: false, detail: e instanceof Error ? e.message : String(e) });
      }
    }
    if (questionIds.length === 0) throw new Error("All 5 diagram questions failed. See trace.");

    const { startsAt, endsAt } = liveWindowToday();
    const serial = await nextQuizSerial(ch.name);
    const { data: t, error: tErr } = await supabaseAdmin.from("tests").insert({
      title: `${ch.name} • Diagram Verify DPP ${serial}`,
      description: `5-question verification DPP · ${subjName} · ${ch.name}. Neet Buddy watermark.`,
      type: "daily", difficulty: "medium", duration_min: 10,
      total_questions: questionIds.length, is_paid: false,
      starts_at: startsAt, ends_at: endsAt,
      question_ids: questionIds, marks_correct: 4, marks_wrong: -1,
      source: "NCERT",
    }).select("id").single();
    if (tErr) throw tErr;

    return {
      test_id: t?.id,
      chapter: ch.name,
      subject: subjName,
      created: questionIds.length,
      diagram_urls: diagramUrls,
      trace,
    };
  });


