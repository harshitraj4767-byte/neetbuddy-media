// Data access for Flashcards.
// `flashcards` is public read-only (RLS: SELECT to anon + authenticated), so the
// browser client reads it directly. The old path went through a server function
// using the service-role client, which fails against the Data API with the new
// `sb_secret_*` key format ("Expected 3 parts in JWT; got 1").
import { supabase } from "@/integrations/supabase/client";

export type Flashcard = {
  id: string;
  subject_id: string | null;
  chapter_id: string | null;
  front: string;
  back: string;
  difficulty: string;
  source: string;
};

export type Deck = {
  subject_id: string | null;
  subject_name: string;
  chapter_id: string | null;
  chapter_name: string;
  count: number;
};

const CARD_COLS = "id,subject_id,chapter_id,front,back,difficulty,source";

// The generated Database types don't include the flashcard tables yet.
type QueryBuilder = {
  select: (cols: string) => QueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => QueryBuilder };

export async function listFlashcardDecks(): Promise<{ decks: Deck[]; totalCards: number }> {
  const rows: Array<{ subject_id: string | null; chapter_id: string | null }> = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 200000; offset += PAGE) {
    const { data, error } = await db
      .from("flashcards")
      .select("subject_id,chapter_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as typeof rows;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.subject_id ?? ""}::${r.chapter_id ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const [{ data: subjects }, { data: chapters }] = await Promise.all([
    db.from("subjects").select("id,name"),
    db.from("chapters").select("id,name,subject_id"),
  ]);
  const subjById = new Map<string, string>(
    ((subjects ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
  );
  const chById = new Map<string, { id: string; name: string }>(
    ((chapters ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c]),
  );

  const decks: Deck[] = [];
  for (const [key, count] of counts) {
    const [sid, cid] = key.split("::");
    decks.push({
      subject_id: sid || null,
      subject_name: (sid && subjById.get(sid)) || "General",
      chapter_id: cid || null,
      chapter_name: (cid && chById.get(cid)?.name) || "Mixed",
      count,
    });
  }
  decks.sort(
    (a, b) =>
      a.subject_name.localeCompare(b.subject_name) || a.chapter_name.localeCompare(b.chapter_name),
  );
  return { decks, totalCards: rows.length };
}

export async function getFlashcards(input: {
  chapter_id?: string | null;
  subject_id?: string | null;
  limit?: number;
}): Promise<{ cards: Flashcard[] }> {
  let q = db.from("flashcards").select(CARD_COLS);
  if (input.chapter_id) q = q.eq("chapter_id", input.chapter_id);
  else if (input.subject_id) q = q.eq("subject_id", input.subject_id);
  const { data, error } = await q.limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Flashcard[];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { cards: list };
}
