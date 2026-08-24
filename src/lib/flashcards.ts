// Data access for Flashcards.
// Live schema (source of truth):
//   flashcard_decks(id, title, subject, description, card_count, sort_order, is_active)
//   flashcards(id, deck_id, front, back, hint, tags, difficulty, source, position)
// Both are public read-only (RLS: SELECT to anon + authenticated), so the
// browser client reads them directly — no server function, no service-role key.
import { supabase } from "@/integrations/supabase/client";

export type Flashcard = {
  id: string;
  deck_id: string | null;
  front: string;
  back: string;
  hint: string | null;
  difficulty: string;
  source: string;
};

export type Deck = {
  id: string | null;
  title: string;
  subject: string;
  description: string | null;
  count: number;
};

const CARD_COLS = "id,deck_id,front,back,hint,difficulty,source,position";

// The generated Database types don't include the flashcard tables yet.
type QueryBuilder = {
  select: (cols: string) => QueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  limit: (n: number) => QueryBuilder;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => QueryBuilder };

type DeckRow = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  card_count: number;
  sort_order: number;
};

export async function listFlashcardDecks(): Promise<{ decks: Deck[]; totalCards: number }> {
  const { data, error } = await db
    .from("flashcard_decks")
    .select("id,title,subject,description,card_count,sort_order")
    .order("subject", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DeckRow[];

  // card_count is a denormalised column, so verify it against the real rows.
  const live = await countCardsPerDeck();
  const decks: Deck[] = rows.map((d) => ({
    id: d.id,
    title: d.title,
    subject: d.subject,
    description: d.description,
    count: live.get(d.id) ?? d.card_count ?? 0,
  }));
  const totalCards = decks.reduce((n, d) => n + d.count, 0);
  return { decks: decks.filter((d) => d.count > 0), totalCards };
}

async function countCardsPerDeck(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; offset < 200000; offset += PAGE) {
    const { data, error } = await db
      .from("flashcards")
      .select("deck_id")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as Array<{ deck_id: string | null }>;
    for (const r of chunk) {
      if (!r.deck_id) continue;
      counts.set(r.deck_id, (counts.get(r.deck_id) ?? 0) + 1);
    }
    if (chunk.length < PAGE) break;
  }
  return counts;
}

export async function getFlashcards(input: {
  deck_id?: string | null;
  limit?: number;
}): Promise<{ cards: Flashcard[] }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  let q = db.from("flashcards").select(CARD_COLS);
  if (input.deck_id) q = q.eq("deck_id", input.deck_id);
  const { data, error } = await q.limit(input.deck_id ? 200 : 400);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as Flashcard[];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { cards: list.slice(0, limit) };
}
