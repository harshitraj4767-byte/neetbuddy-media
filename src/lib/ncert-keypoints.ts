// Data layer for the NCERT Nuggets experience.
//
// A chapter is split into TOPICS (the "6.1", "6.2" … NCERT sections). Each
// topic is a sequence of STEPS: a paragraph rendered on a paper-like page,
// immediately followed by every question that belongs to that paragraph.
//
// Questions come from BOTH sources — not PYQs only:
//   • ncert_book_pyq  — the PYQs explicitly linked to a line (block.pyq_ids)
//   • qb_questions    — the full question bank for the matching chapter,
//                       distributed to the closest topic + paragraph.
//
// All source tables (ncert_book_*, qb_*) are anon-readable, so the browser
// client reads them directly. User answers/progress live in
// ncert_keypoint_answers / ncert_keypoint_progress (RLS scoped to the user).
import { supabase } from "@/integrations/supabase/client";
import {
  getBookChapter,
  runsOf,
  type Run,
  getBookPyqs,
  type BookBlock,
  type BookChapter,
  type BookPyq,
} from "@/lib/ncert-book";

export type { BookChapter, BookBlock, Run };

type LooseTable = {
  select: (cols: string) => LooseTable;
  eq: (col: string, val: unknown) => LooseTable;
  in: (col: string, vals: unknown[]) => LooseTable;
  order: (col: string, opts: { ascending: boolean }) => LooseTable;
  range: (from: number, to: number) => LooseTable;
  insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }>;
  upsert: (
    rows: unknown,
    opts?: { onConflict?: string },
  ) => PromiseLike<{ error: { message: string } | null }>;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => LooseTable };

/* ------------------------------- types ------------------------------- */

export type QuestionSource = "pyq" | "qb";

export type KeyPointQuestion = {
  /** Stable key across both sources, e.g. "qb:1263". */
  key: string;
  source: QuestionSource;
  id: number;
  /** HTML (question bank) or plain text (PYQ) — render with PyqRichText. */
  question: string;
  options: { key: string; text: string }[];
  correctKey: string | null;
  explanation: string | null;
  imageUrl: string | null;
  explanationImageUrl: string | null;
  difficulty: string | null;
  year: number | null;
};

export type KeyPointFigure = { url: string; caption: string; runs: Run[] };

export type KeyPointPara = {
  blockId: number;
  kind: "paragraph" | "heading" | "image";
  text: string;
  /** Formatted runs (highlights + inline figures) for faithful rendering. */
  runs: Run[];
  imageUrl: string | null;
  /** Section/sub-section heading shown on the SAME page as this paragraph. */
  heading: string | null;
  headingRuns: Run[];
  /** Figures shown on the SAME page, each with its own caption. */
  figures: KeyPointFigure[];
  /** Block ids merged into this page (headings/figures) — keeps PYQ links. */
  extraBlockIds: number[];
  questions: KeyPointQuestion[];
};

export type KeyPointStep =
  | { kind: "para"; para: KeyPointPara; index: number }
  | { kind: "question"; para: KeyPointPara; question: KeyPointQuestion; index: number };

export type KeyPointTopic = {
  /** Section number ("6.1") or "intro" — stable across imports. */
  key: string;
  title: string;
  paras: KeyPointPara[];
  steps: KeyPointStep[];
  paraCount: number;
  questionCount: number;
};

export type ChapterKeyPoints = {
  chapter: BookChapter;
  topics: KeyPointTopic[];
  questionTotal: number;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/* ---------------------------- text helpers ---------------------------- */

const STOP = new Set(
  ("the a an of and or in on for to with is are was were be been by as at from that this these those " +
    "which what it its into their they them can may also such other more most than then when where " +
    "not no all any some each both between during following above below both very only same so").split(
    " ",
  ),
);

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function tokens(s: string): Set<string> {
  return new Set(
    stripHtml(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits / Math.sqrt(a.size * b.size);
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "6.1.2 Permanent Tissues" -> { section: "6.1", top: "6", title } */
function parseHeading(text: string): { section: string | null; title: string } {
  const m = text.trim().match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
  if (!m) return { section: null, title: text.trim() };
  const parts = m[1].split(".");
  return { section: parts.slice(0, 2).join("."), title: m[2].trim() };
}

/* --------------------------- topic building --------------------------- */

function textOf(b: BookBlock): string {
  if (b.text && b.text.trim()) return b.text.trim();
  const runs = Array.isArray(b.content) ? b.content : [];
  return runs
    .map((r) => (r.t === "br" ? "\n" : (r.s ?? "")))
    .join("")
    .trim();
}

/** Group a chapter's blocks into NCERT sections, dropping the TOC repeat. */
export function buildTopics(blocks: BookBlock[]): KeyPointTopic[] {
  const order: string[] = [];
  const byKey = new Map<string, KeyPointTopic>();

  const ensure = (key: string, title: string): KeyPointTopic => {
    let t = byKey.get(key);
    if (!t) {
      t = {
        key,
        title,
        paras: [],
        steps: [],
        paraCount: 0,
        questionCount: 0,
      };
      byKey.set(key, t);
      order.push(key);
    } else if (title && (t.title === "Introduction" || t.title.length < title.length)) {
      // Prefer the fuller heading text if the TOC entry was shorter.
      if (key !== "intro") t.title = title;
    }
    return t;
  };

  let current = ensure("intro", "Introduction");
  let seenBody = false;


  for (const b of blocks) {
    const text = textOf(b);
    if (b.type === "heading") {
      const { section, title } = parseHeading(text);
      if (section) {
        const topLevel = section.split(".").length === 2 && !/^\d+\.\d+\.\d+/.test(text.trim());
        current = ensure(section, topLevel ? title : current.key === section ? current.title : title);
        // Sub-headings (6.1.2) are shown as a heading page inside the topic.
        if (/^\d+\.\d+\.\d+/.test(text.trim())) {
          current.paras.push({
            blockId: b.id,
            kind: "heading",
            text,
            runs: runsOf(b),
            imageUrl: null,
            heading: null,
            headingRuns: [],
            figures: [],
            extraBlockIds: [],
            questions: [],
          });
        }
        continue;
      }
      current.paras.push({
        blockId: b.id,
        kind: "heading",
        text,
        runs: runsOf(b),
        imageUrl: null,
        heading: null,
        headingRuns: [],
        figures: [],
        extraBlockIds: [],
        questions: [],
      });
      continue;
    }

    if (b.type === "image") {
      if (!b.image_url) continue;
      current.paras.push({
        blockId: b.id,
        kind: "image",
        text,
        runs: runsOf(b),
        imageUrl: b.image_url,
        heading: null,
        headingRuns: [],
        figures: [],
        extraBlockIds: [],
        questions: [],
      });
      continue;
    }

    const runs = runsOf(b);
    if (!text && !runs.some((r) => r.t === "img")) continue;

    // The very first line of a chapter is its TITLE stored as a paragraph
    // ("Anatomy of Flowering Plants"). Treat it as a heading so it is printed
    // on the same page as the introduction instead of on a page of its own.
    const isChapterTitle =
      !seenBody &&
      current.key === "intro" &&
      text.length > 0 &&
      text.length < 120 &&
      !/[.?!:;]$/.test(text) &&
      !isBulletLine(text) &&
      text.split(/\s+/).length <= 14;


    if (isChapterTitle) {
      current.paras.push({
        blockId: b.id,
        kind: "heading",
        text,
        runs,
        imageUrl: null,
        heading: null,
        headingRuns: [],
        figures: [],
        extraBlockIds: [],
        questions: [],
      });
      continue;
    }
    seenBody = true;

    current.paras.push({
      blockId: b.id,
      kind: "paragraph",
      text,
      runs,
      imageUrl: null,
      heading: null,
      headingRuns: [],
      figures: [],
      extraBlockIds: [],
      questions: [],
    });

  }

  for (const t of byKey.values()) t.paras = mergePages(t.paras);

  return order
    .map((k) => byKey.get(k)!)
    .filter((t) => t.paras.some((p) => p.kind === "paragraph"));
}

const CAPTION_RE = /^\s*fig(?:ure)?\s*\.?\s*\d/i;
const BULLET_RE = /^\s*(?:[•·▪◦‣∙*–—-]|\(?[ivxIVX]{1,4}\)|\(?[a-zA-Z]\)|\d+[.)])\s+/;

/** A stand-alone bullet / numbered list item — never a page of its own. */
function isBulletLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d+\.\d/.test(t)) return false; // "6.1 …" is a section heading
  return BULLET_RE.test(t);
}

/**
 * A short line with no sentence punctuation is a title, not a paragraph
 * ("Tissue System", "Meristematic Tissues"). It must share the page with the
 * text that follows it.
 */
function isTitleLike(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 90) return false;
  if (isBulletLine(t)) return false;
  if (/[.?!:;,]$/.test(t)) return false;
  if (t.split(/\s+/).length > 12) return false;
  return true;
}

/**
 * Collapse the raw block stream into real book pages.
 *
 * A heading never gets a page of its own: it is printed above the paragraph
 * that follows it. A figure never gets a page of its own either: it is printed
 * inside the paragraph it belongs to, together with its "Fig 6.2 …" caption.
 * Bullet points are never split across pages: every consecutive list item is
 * printed on the same page as the line (and title) that introduced it.
 */
function mergePages(paras: KeyPointPara[]): KeyPointPara[] {
  const out: KeyPointPara[] = [];
  let pendingHeading: KeyPointPara | null = null;
  let pendingFigures: KeyPointPara[] = [];


  const attachFigures = (host: KeyPointPara, figs: KeyPointPara[]) => {
    for (const f of figs) {
      host.figures.push({ url: f.imageUrl!, caption: f.text, runs: f.runs });
      host.extraBlockIds.push(f.blockId);
      host.questions.push(...f.questions);
    }
  };

  const addHeading = (p: KeyPointPara) => {
    if (pendingHeading) {
      // Two headings back to back (6.1 then 6.1.2) — keep both lines.
      pendingHeading = {
        ...pendingHeading,
        text: `${pendingHeading.text}\n${p.text}`,
        runs: [...pendingHeading.runs, { t: "br" } as Run, ...p.runs],
        extraBlockIds: [...pendingHeading.extraBlockIds, p.blockId],
        questions: [...pendingHeading.questions, ...p.questions],
      };
    } else {
      pendingHeading = p;
    }
  };

  /** Print a list item on the page that is already open. */
  const appendLine = (host: KeyPointPara, p: KeyPointPara) => {
    host.text = host.text ? `${host.text}\n${p.text}` : p.text;
    host.runs = [...host.runs, { t: "br" } as Run, ...p.runs];
    host.extraBlockIds.push(p.blockId);
    host.questions.push(...p.questions);
  };

  for (const p of paras) {
    if (p.kind === "heading") {
      addHeading(p);
      continue;
    }

    if (p.kind === "image") {
      if (!p.imageUrl) continue;
      // A figure belongs to the paragraph just before it when there is one.
      if (out.length > 0 && !pendingHeading) attachFigures(out[out.length - 1], [p]);
      else pendingFigures.push(p);
      continue;
    }

    // A bare "Fig 6.2 …" line is a caption, not a page.
    if (CAPTION_RE.test(p.text) && p.text.trim().length < 260) {
      const host = pendingFigures.length ? pendingFigures[pendingFigures.length - 1] : null;
      if (host) {
        host.text = host.text ? `${host.text} ${p.text}`.trim() : p.text;
        host.extraBlockIds.push(p.blockId);
        host.questions.push(...p.questions);
        continue;
      }
      const last = out[out.length - 1];
      if (last && last.figures.length) {
        const fig = last.figures[last.figures.length - 1];
        fig.caption = fig.caption ? `${fig.caption} ${p.text}`.trim() : p.text;
        last.extraBlockIds.push(p.blockId);
        last.questions.push(...p.questions);
        continue;
      }
    }

    // Bullet points belong to the page that introduced them — never alone.
    if (isBulletLine(p.text) && !pendingHeading && out.length > 0) {
      appendLine(out[out.length - 1], p);
      continue;
    }

    // A short title-ish line ("Tissue System") is a heading for the next page,
    // so a title is never printed on a page without its text.
    if (isTitleLike(p.text) && !isBulletLine(p.text)) {
      addHeading({ ...p, kind: "heading" });
      continue;
    }

    const page: KeyPointPara = { ...p, figures: [...p.figures], extraBlockIds: [...p.extraBlockIds] };

    if (pendingHeading) {
      page.heading = pendingHeading.text;
      page.headingRuns = pendingHeading.runs;
      page.extraBlockIds.push(pendingHeading.blockId, ...pendingHeading.extraBlockIds);
      page.questions = [...pendingHeading.questions, ...page.questions];
      pendingHeading = null;
    }
    if (pendingFigures.length) {
      attachFigures(page, pendingFigures);
      pendingFigures = [];
    }
    out.push(page);
  }

  // Leftovers at the end of a section still have to be shown somewhere.
  const last = out[out.length - 1];
  if (last) {
    if (pendingHeading) {
      // Keep the text visible on the previous page instead of dropping it.
      appendLine(last, pendingHeading);
    }
    if (pendingFigures.length) attachFigures(last, pendingFigures);
  } else {
    if (pendingHeading) out.push(pendingHeading);
    for (const f of pendingFigures) out.push(f);
  }


  return out;
}

/* ------------------------- question normalising ------------------------ */

function pyqToQuestion(p: BookPyq): KeyPointQuestion {
  const raw: [string, string | null][] = [
    ["A", p.option_a],
    ["B", p.option_b],
    ["C", p.option_c],
    ["D", p.option_d],
  ];
  const options = raw
    .filter(([, v]) => !!(v ?? "").trim())
    .map(([k, v]) => ({ key: k, text: (v ?? "").trim() }));

  const answer = (p.answer ?? "").trim();
  let correctKey: string | null = null;
  if (answer) {
    const letter = answer.replace(/[^a-dA-D]/g, "").slice(0, 1).toUpperCase();
    if (answer.length <= 3 && LETTERS.includes(letter)) correctKey = letter;
    else {
      const norm = (s: string) => normName(stripHtml(s));
      correctKey =
        options.find((o) => norm(o.text) === norm(answer))?.key ??
        (LETTERS.includes(letter) ? letter : null);
    }
  }

  return {
    key: `pyq:${p.unique_id}`,
    source: "pyq",
    id: Number(p.unique_id),
    question: p.question ?? "",
    options,
    correctKey,
    explanation: p.explanation,
    imageUrl: p.image_url,
    explanationImageUrl: null,
    difficulty: p.difficulty,
    year: null,
  };
}

type QbRow = {
  id: number;
  topic_id: number | null;
  question_html: string;
  options: { text?: string; isCorrect?: boolean }[] | null;
  correct_index: number | null;
  explanation: string | null;
  question_image_url: string | null;
  explanation_image_url: string | null;
  difficulty: string | null;
  year: number | null;
};

function qbToQuestion(r: QbRow): KeyPointQuestion {
  const opts = (r.options ?? []).map((o, i) => ({
    key: LETTERS[i] ?? String(i + 1),
    text: (o?.text ?? "").trim(),
  }));
  let idx = typeof r.correct_index === "number" ? r.correct_index : -1;
  if (idx < 0) idx = (r.options ?? []).findIndex((o) => o?.isCorrect);
  return {
    key: `qb:${r.id}`,
    source: "qb",
    id: Number(r.id),
    question: r.question_html ?? "",
    options: opts,
    correctKey: opts[idx]?.key ?? null,
    explanation: r.explanation,
    imageUrl: r.question_image_url,
    explanationImageUrl: r.explanation_image_url,
    difficulty: r.difficulty,
    year: r.year,
  };
}

/* --------------------------- question bank fetch ------------------------ */

async function fetchQbChapterId(chapter: BookChapter): Promise<number | null> {
  const { data, error } = await db
    .from("qb_chapters")
    .select("id,subject_id,name")
    .eq("subject_id", chapter.subject);
  if (error) return null;
  const rows = (data ?? []) as { id: number; name: string }[];
  const want = normName(chapter.title);
  const exact = rows.find((r) => normName(r.name) === want);
  if (exact) return exact.id;
  const loose = rows.find(
    (r) => normName(r.name).includes(want) || want.includes(normName(r.name)),
  );
  return loose?.id ?? null;
}

async function fetchQbQuestions(
  qbChapterId: number,
): Promise<{ rows: QbRow[]; topics: { id: number; name: string }[] }> {
  const PAGE = 1000;
  const rows: QbRow[] = [];
  for (let off = 0; off < 20000; off += PAGE) {
    const { data, error } = await db
      .from("qb_questions")
      .select(
        "id,topic_id,question_html,options,correct_index,explanation,question_image_url,explanation_image_url,difficulty,year",
      )
      .eq("chapter_id", qbChapterId)
      .order("id", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as QbRow[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const { data: tData } = await db.from("qb_topics").select("id,name").eq("chapter_id", qbChapterId);
  return { rows, topics: (tData ?? []) as { id: number; name: string }[] };
}

/* ------------------------------ assignment ----------------------------- */

/**
 * Attach every question to a paragraph:
 *  1. Linked PYQs go on their exact NCERT line.
 *  2. Bank questions go to the topic their qb_topic maps to (falling back to
 *     text similarity), then to the closest paragraph inside that topic.
 */
function assignQuestions(
  topics: KeyPointTopic[],
  pyqsByBlock: Map<number, KeyPointQuestion[]>,
  qb: { rows: QbRow[]; topics: { id: number; name: string }[] },
) {
  const paraTokens = new Map<number, Set<string>>();
  const topicTokens = new Map<string, Set<string>>();

  for (const t of topics) {
    const bag = new Set<string>(tokens(t.title));
    for (const p of t.paras) {
      if (p.kind !== "paragraph") continue;
      const tk = tokens(p.text);
      paraTokens.set(p.blockId, tk);
      for (const w of tk) bag.add(w);
    }
    topicTokens.set(t.key, bag);
    // 1. linked PYQs (including blocks merged into this page)
    for (const p of t.paras) {
      for (const id of [p.blockId, ...p.extraBlockIds]) {
        const linked = pyqsByBlock.get(id);
        if (linked?.length) p.questions.push(...linked);
      }
    }
  }

  // qb topic -> book topic
  const topicOfQbTopic = new Map<number, KeyPointTopic>();
  for (const qt of qb.topics) {
    const tk = tokens(qt.name);
    let best: KeyPointTopic | null = null;
    let bestScore = 0;
    for (const t of topics) {
      const s = Math.max(overlap(tk, tokens(t.title)), overlap(tk, topicTokens.get(t.key)!) * 0.6);
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
    if (best && bestScore > 0.12) topicOfQbTopic.set(qt.id, best);
  }

  let rr = 0;
  const seen = new Set<string>();
  for (const t of topics) for (const p of t.paras) for (const q of p.questions) seen.add(q.key);

  for (const row of qb.rows) {
    const q = qbToQuestion(row);
    if (seen.has(q.key)) continue;
    const qTokens = tokens(q.question + " " + q.options.map((o) => o.text).join(" "));

    let topic = row.topic_id != null ? topicOfQbTopic.get(row.topic_id) : undefined;
    if (!topic) {
      let bestScore = 0;
      for (const t of topics) {
        const s = overlap(qTokens, topicTokens.get(t.key)!);
        if (s > bestScore) {
          bestScore = s;
          topic = t;
        }
      }
      if (!topic || bestScore < 0.06) topic = topics[rr++ % topics.length];
    }

    const paras = topic.paras.filter((p) => p.kind === "paragraph");
    if (paras.length === 0) continue;
    let target = paras[0];
    let bestScore = 0;
    for (const p of paras) {
      const s = overlap(qTokens, paraTokens.get(p.blockId) ?? new Set());
      if (s > bestScore) {
        bestScore = s;
        target = p;
      }
    }
    if (bestScore < 0.08) target = paras[rr++ % paras.length];
    target.questions.push(q);
    seen.add(q.key);
  }

  // Flatten into the linear step list the player walks through.
  // Drop repeats: the same question can arrive from both sources or sit in the
  // bank more than once, which used to show up 3x in a row during revision.
  for (const t of topics) {
    const seenText = new Set<string>();
    for (const p of t.paras) {
      p.questions = p.questions.filter((q) => {
        const sig = normName(stripHtml(q.question)) + "|" + q.options.map((o) => normName(stripHtml(o.text))).join("|");
        if (!sig || seenText.has(sig)) return false;
        seenText.add(sig);
        return true;
      });
    }
  }

  for (const t of topics) {
    t.steps = [];
    for (const p of t.paras) {
      t.steps.push({ kind: "para", para: p, index: t.steps.length });
      for (const q of p.questions)
        t.steps.push({ kind: "question", para: p, question: q, index: t.steps.length });
    }
    t.paraCount = t.paras.filter((p) => p.kind === "paragraph").length;
    t.questionCount = t.paras.reduce((n, p) => n + p.questions.length, 0);
  }
}

/** Everything the Key Points page needs for one chapter. */
export async function getChapterKeyPoints(slug: string): Promise<ChapterKeyPoints> {
  const { chapter, blocks } = await getBookChapter(slug);
  const topics = buildTopics(blocks);

  const allPyqIds = blocks.flatMap((b) => b.pyq_ids ?? []);
  const pyqs = await getBookPyqs(allPyqIds);
  const pyqById = new Map(pyqs.map((p) => [Number(p.unique_id), pyqToQuestion(p)]));
  const pyqsByBlock = new Map<number, KeyPointQuestion[]>();
  for (const b of blocks) {
    const list = (b.pyq_ids ?? [])
      .map((id) => pyqById.get(Number(id)))
      .filter((q): q is KeyPointQuestion => !!q);
    if (list.length) pyqsByBlock.set(b.id, list);
  }

  let qb: { rows: QbRow[]; topics: { id: number; name: string }[] } = { rows: [], topics: [] };
  const qbChapterId = await fetchQbChapterId(chapter);
  if (qbChapterId != null) {
    try {
      qb = await fetchQbQuestions(qbChapterId);
    } catch {
      qb = { rows: [], topics: [] };
    }
  }

  assignQuestions(topics, pyqsByBlock, qb);
  const questionTotal = topics.reduce((n, t) => n + t.questionCount, 0);
  return { chapter, topics, questionTotal };
}

/* ------------------------- answers and progress ------------------------ */

export type KeyPointAnswer = {
  chapter_slug: string;
  topic_key: string;
  block_id: number | null;
  source: QuestionSource;
  question_id: number;
  selected: string | null;
  is_correct: boolean;
  skipped: boolean;
  time_ms: number | null;
  answered_at: string;
};

/** Append one attempt (history is kept so revision runs show up too). */
export async function saveKeyPointAnswer(input: {
  userId: string | null | undefined;
  chapterSlug: string;
  topicKey: string;
  blockId: number | null;
  question: KeyPointQuestion;
  selected: string | null;
  isCorrect: boolean;
  skipped: boolean;
  timeMs: number | null;
}): Promise<void> {
  if (!input.userId) return;
  const { error } = await db.from("ncert_keypoint_answers").insert({
    user_id: input.userId,
    chapter_slug: input.chapterSlug,
    topic_key: input.topicKey,
    block_id: input.blockId,
    source: input.question.source,
    question_id: input.question.id,
    selected: input.selected,
    is_correct: input.isCorrect,
    skipped: input.skipped,
    time_ms: input.timeMs,
  });
  if (error) throw new Error(error.message);
}

export async function saveKeyPointProgress(input: {
  userId: string | null | undefined;
  chapterSlug: string;
  topicKey: string;
  stepIndex: number;
  stepsTotal: number;
  completed: boolean;
}): Promise<void> {
  if (!input.userId) return;
  await db.from("ncert_keypoint_progress").upsert(
    {
      user_id: input.userId,
      chapter_slug: input.chapterSlug,
      topic_key: input.topicKey,
      step_index: input.stepIndex,
      steps_total: input.stepsTotal,
      completed: input.completed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chapter_slug,topic_key" },
  );
}

export type TopicProgress = {
  topic_key: string;
  step_index: number;
  steps_total: number;
  completed: boolean;
};

/** topic_key -> saved position, for one chapter. */
export async function getChapterProgress(
  userId: string,
  chapterSlug: string,
): Promise<Record<string, TopicProgress>> {
  const { data, error } = await db
    .from("ncert_keypoint_progress")
    .select("topic_key,step_index,steps_total,completed")
    .eq("user_id", userId)
    .eq("chapter_slug", chapterSlug);
  if (error) throw new Error(error.message);
  const out: Record<string, TopicProgress> = {};
  for (const r of (data ?? []) as TopicProgress[]) out[r.topic_key] = r;
  return out;
}

/** Every chapter's attempted-question count, for the chapter list. */
export async function getKeyPointChapterStats(
  userId: string,
): Promise<Record<string, { attempted: number; correct: number }>> {
  const PAGE = 1000;
  const seen = new Map<string, { keys: Set<string>; correct: Set<string> }>();
  for (let off = 0; off < 200000; off += PAGE) {
    const { data, error } = await db
      .from("ncert_keypoint_answers")
      .select("chapter_slug,source,question_id,is_correct")
      .eq("user_id", userId)
      .range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as {
      chapter_slug: string;
      source: string;
      question_id: number;
      is_correct: boolean;
    }[];
    for (const r of chunk) {
      const bucket =
        seen.get(r.chapter_slug) ?? { keys: new Set<string>(), correct: new Set<string>() };
      const k = `${r.source}:${r.question_id}`;
      bucket.keys.add(k);
      if (r.is_correct) bucket.correct.add(k);
      seen.set(r.chapter_slug, bucket);
    }
    if (chunk.length < PAGE) break;
  }
  const out: Record<string, { attempted: number; correct: number }> = {};
  for (const [slug, b] of seen) out[slug] = { attempted: b.keys.size, correct: b.correct.size };
  return out;
}

/** Raw attempts for one chapter — powers the analytics view. */
export async function getChapterAnswers(
  userId: string,
  chapterSlug: string,
): Promise<KeyPointAnswer[]> {
  const PAGE = 1000;
  const out: KeyPointAnswer[] = [];
  for (let off = 0; off < 50000; off += PAGE) {
    const { data, error } = await db
      .from("ncert_keypoint_answers")
      .select(
        "chapter_slug,topic_key,block_id,source,question_id,selected,is_correct,skipped,time_ms,answered_at",
      )
      .eq("user_id", userId)
      .eq("chapter_slug", chapterSlug)
      .order("answered_at", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as KeyPointAnswer[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}
