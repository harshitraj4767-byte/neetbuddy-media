// Import + link the per-subject NCERT PYQ datasets that ship in /public/ncert/pyq.
//
// Physics had zero rows in `ncert_book_pyq` (only biology/chemistry were ever
// loaded) and block linkage (`ncert_book_blocks.pyq_ids`) was incomplete, so the
// Highlighted-NCERT reader showed no questions for physics chapters.
//
// Everything here runs through the browser Supabase client: reads are public and
// writes are gated by the admin-only RLS policies added in
// supabase/migrations-manual/20260824_ncert_book_pyq_admin.sql.
import { supabase } from "@/integrations/supabase/client";

export type SyncSubject = "physics" | "chemistry" | "biology";

type RawPyq = Record<string, unknown>;

export type PyqRow = {
  unique_id: number;
  subject: string;
  question: string | null;
  answer: string | null;
  explanation: string | null;
  topic_name: string | null;
  chapter_name: string | null;
  difficulty: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  image_url: string | null;
};

type AnyBuilder = {
  select: (cols: string, opts?: unknown) => AnyBuilder;
  order: (col: string, opts: { ascending: boolean }) => AnyBuilder;
  eq: (col: string, val: unknown) => AnyBuilder;
  in: (col: string, vals: unknown[]) => AnyBuilder;
  range: (from: number, to: number) => AnyBuilder;
  upsert: (rows: unknown, opts?: unknown) => PromiseLike<{ error: { message: string } | null }>;
  update: (patch: unknown) => AnyBuilder;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => AnyBuilder };

const str = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s ? s : null;
};

/** "Class 11 Physics >> Units and Measurement >> Introduction" -> "Units and Measurement" */
export function chapterFromTopic(topic: string | null): string | null {
  if (!topic) return null;
  const parts = topic.split(">>").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? (parts[1] ?? null) : (parts[0] ?? null);
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set([
  "the", "and", "of", "in", "a", "an", "to", "for", "on", "is", "are", "with", "its",
  "class", "chapter", "physics", "chemistry", "biology", "questions", "lecture",
]);

const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t));

function overlap(a: string[], b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

/** Load and normalise /ncert/pyq/{subject}.json into `ncert_book_pyq` row shape. */
export async function loadSubjectDataset(subject: SyncSubject): Promise<PyqRow[]> {
  const [dataRes, manifestRes] = await Promise.all([
    fetch(`/ncert/pyq/${subject}.json`),
    fetch(`/ncert/pyq/images/${subject}.manifest.json`).catch(() => null),
  ]);
  if (!dataRes.ok) throw new Error(`Dataset /ncert/pyq/${subject}.json not found`);
  const raw = (await dataRes.json()) as RawPyq[];
  const manifest = new Set<string>(
    manifestRes && manifestRes.ok ? ((await manifestRes.json()) as string[]) : [],
  );

  const rows: PyqRow[] = [];
  for (const item of raw) {
    const uid = Number(item["unique_id"]);
    if (!Number.isFinite(uid)) continue;
    const topic = str(item["topic_name"]);
    const quizType = str(item["quiz_type"]) ?? "mcq";
    if (quizType === "video") continue;
    const imgPath = `ncert/pyq/images/${subject}/${quizType}/${uid}q.png`;
    rows.push({
      unique_id: uid,
      subject,
      question: str(item["question"]),
      answer: str(item["answer"]),
      explanation: str(item["explanation"]),
      topic_name: topic,
      chapter_name: chapterFromTopic(topic),
      difficulty: str(item["difficulty_level"]),
      option_a: str(item["option_a"]),
      option_b: str(item["option_b"]),
      option_c: str(item["option_c"]),
      option_d: str(item["option_d"]),
      image_url: manifest.has(imgPath) ? imgPath : null,
    });
  }
  return rows;
}

/** Upsert dataset rows into `ncert_book_pyq` in chunks. */
export async function importSubjectPyqs(
  subject: SyncSubject,
  onProgress?: (done: number, total: number) => void,
): Promise<{ imported: number }> {
  const rows = await loadSubjectDataset(subject);
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("ncert_book_pyq")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "unique_id" });
    if (error) throw new Error(error.message);
    onProgress?.(Math.min(i + CHUNK, rows.length), rows.length);
  }
  return { imported: rows.length };
}

async function pageAll(
  table: string,
  cols: string,
  apply: (q: AnyBuilder) => AnyBuilder,
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let off = 0; off < 200000; off += PAGE) {
    const { data, error } = await apply(db.from(table).select(cols)).range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Record<string, unknown>[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

/**
 * Attach every PYQ of a subject to a block of the matching book chapter.
 *
 * A question goes to the heading/paragraph block whose text shares the most
 * words with its topic name; questions with no good match land on the chapter's
 * first block so nothing is silently dropped.
 */
export async function linkSubjectPyqs(
  subject: SyncSubject,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<{ chapters: number; linked: number; unmatchedChapters: string[] }> {
  const chapters = (await pageAll("ncert_book_chapters", "id,subject,slug,title", (q) =>
    q.eq("subject", subject),
  )) as unknown as { id: number; subject: string; slug: string; title: string }[];

  const pyqs = (await pageAll(
    "ncert_book_pyq",
    "unique_id,chapter_name,topic_name",
    (q) => q.eq("subject", subject),
  )) as unknown as { unique_id: number; chapter_name: string | null; topic_name: string | null }[];

  const byChapterName = new Map<string, typeof pyqs>();
  for (const p of pyqs) {
    const key = norm(p.chapter_name ?? "");
    if (!key) continue;
    const list = byChapterName.get(key) ?? [];
    list.push(p);
    byChapterName.set(key, list);
  }

  const used = new Set<string>();
  let linked = 0;
  let done = 0;

  for (const ch of chapters) {
    done += 1;
    onProgress?.(done, chapters.length, ch.title);
    const chTokens = tokens(ch.title);
    // Exact normalised match first, then best token overlap.
    let key = norm(ch.title);
    if (!byChapterName.has(key)) {
      let best = "";
      let bestScore = 0;
      for (const candidate of byChapterName.keys()) {
        if (used.has(candidate)) continue;
        const score = overlap(tokens(candidate), new Set(chTokens));
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      key = bestScore >= Math.max(1, Math.ceil(chTokens.length / 2)) ? best : "";
    }
    if (!key) continue;
    used.add(key);
    const chapterPyqs = byChapterName.get(key) ?? [];
    if (chapterPyqs.length === 0) continue;

    const blocks = (await pageAll("ncert_book_blocks", "id,idx,type,text,pyq_ids", (q) =>
      q.eq("chapter_id", ch.id).order("idx", { ascending: true }),
    )) as unknown as { id: number; idx: number; type: string; text: string | null; pyq_ids: number[] | null }[];
    if (blocks.length === 0) continue;

    const anchors = blocks.filter((b) => (b.text ?? "").trim().length > 30);
    const anchorTokens = anchors.map((b) => new Set(tokens(b.text ?? "")));
    const assignment = new Map<number, number[]>();

    for (const p of chapterPyqs) {
      const topicTokens = tokens(p.topic_name ?? "");
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < anchors.length; i += 1) {
        const score = overlap(topicTokens, anchorTokens[i] as Set<string>);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      const target = bestIdx >= 0 && bestScore >= 2 ? (anchors[bestIdx] as { id: number }).id : (blocks[0] as { id: number }).id;
      const list = assignment.get(target) ?? [];
      list.push(p.unique_id);
      assignment.set(target, list);
    }

    const existing = new Map(blocks.map((b) => [b.id, b.pyq_ids ?? []]));
    for (const [blockId, ids] of assignment) {
      const merged = Array.from(new Set([...(existing.get(blockId) ?? []), ...ids])).sort((a, b) => a - b);
      const { error } = await db
        .from("ncert_book_blocks")
        .update({ pyq_ids: merged })
        .eq("id", blockId);
      if (error) throw new Error(error.message);
      linked += ids.length;
    }

    const { error: chErr } = await db
      .from("ncert_book_chapters")
      .update({ pyq_count: chapterPyqs.length })
      .eq("id", ch.id);
    if (chErr) throw new Error(chErr.message);
  }

  const unmatchedChapters = Array.from(byChapterName.keys()).filter((k) => !used.has(k));
  return { chapters: chapters.length, linked, unmatchedChapters };
}

/** Row counts per subject, used by the admin panel to show real coverage. */
export async function pyqCoverage(): Promise<{ subject: string; rows: number }[]> {
  const subjects: SyncSubject[] = ["physics", "chemistry", "biology"];
  const out: { subject: string; rows: number }[] = [];
  for (const subject of subjects) {
    const rows = await pageAll("ncert_book_pyq", "unique_id", (q) => q.eq("subject", subject));
    out.push({ subject, rows: rows.length });
  }
  return out;
}
