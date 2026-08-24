// Chapter completion for the Highlighted NCERT book.
//
// Completion is measured PURELY in questions: how many of a chapter's PYQs the
// student has answered at least once, out of `ncert_book_chapters.pyq_count`.
// (No "nuggets" or paragraph counts anywhere — those are internal only.)
//
// Attempts live in public.ncert_pyq_answers, RLS-scoped to the signed-in user
// (unique on user_id + pyq_id), so the browser client reads/writes it directly.
import { supabase } from "@/integrations/supabase/client";

type LooseTable = {
  select: (cols: string) => LooseTable;
  eq: (col: string, val: unknown) => LooseTable;
  range: (from: number, to: number) => LooseTable;
  upsert: (rows: unknown, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }>;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => LooseTable };

export type ChapterProgress = {
  /** Distinct questions attempted in this chapter. */
  solved: number;
};

/** Map of chapter_slug -> attempted question count for the current user. */
export async function getNcertProgress(userId: string): Promise<Record<string, number>> {
  const seen = new Map<string, Set<number>>();
  const PAGE = 1000;
  for (let offset = 0; offset < 200000; offset += PAGE) {
    const { data, error } = await db
      .from("ncert_pyq_answers")
      .select("chapter_slug,pyq_id")
      .eq("user_id", userId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ chapter_slug: string | null; pyq_id: number }>;
    for (const r of chunk) {
      if (!r.chapter_slug) continue;
      const set = seen.get(r.chapter_slug) ?? new Set<number>();
      set.add(Number(r.pyq_id));
      seen.set(r.chapter_slug, set);
    }
    if (chunk.length < PAGE) break;
  }
  const out: Record<string, number> = {};
  for (const [slug, set] of seen) out[slug] = set.size;
  return out;
}

/** Record (or re-record) one attempt. Silently no-ops for guests. */
export async function saveNcertAnswer(input: {
  userId: string | null | undefined;
  pyqId: number;
  chapterSlug?: string | null;
  blockId?: number | null;
  selected?: string | null;
  isCorrect: boolean;
}): Promise<void> {
  if (!input.userId) return;
  const { error } = await db.from("ncert_pyq_answers").upsert(
    {
      user_id: input.userId,
      pyq_id: input.pyqId,
      chapter_slug: input.chapterSlug ?? null,
      block_id: input.blockId ?? null,
      selected: input.selected ?? null,
      is_correct: input.isCorrect,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "user_id,pyq_id" },
  );
  if (error) console.error("saveNcertAnswer", error.message);
}
