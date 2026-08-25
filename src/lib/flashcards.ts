// Data access for Flashcards.
// Live schema (source of truth):
//   flashcard_decks(id, title, subject, description, card_count, sort_order, is_active)
//   flashcards(id, deck_id, front, back, front_body, back_body, hint, tags,
//              difficulty, source, position)
// Both are public read-only (RLS: SELECT to anon + authenticated), so the
// browser client reads them directly — no server function, no service-role key.
import { supabase } from "@/integrations/supabase/client";

/** A rendered block inside front_body / back_body. */
export type CardBlock = { type: string; value: string };
export type CardBody = { content?: CardBlock[] } | null;

export type Flashcard = {
  id: string;
  deck_id: string | null;
  front: string;
  back: string;
  front_body: CardBody;
  back_body: CardBody;
  hint: string | null;
  tags: string[];
  difficulty: string;
  source: string;
  position: number;
};

export type Deck = {
  id: string | null;
  title: string;
  subject: string;
  description: string | null;
  count: number;
};

const CARD_COLS =
  "id,deck_id,front,back,front_body,back_body,hint,tags,difficulty,source,position";

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

function normalise(row: Record<string, unknown>): Flashcard {
  return {
    id: String(row.id),
    deck_id: (row.deck_id as string | null) ?? null,
    front: (row.front as string) ?? "",
    back: (row.back as string) ?? "",
    front_body: (row.front_body as CardBody) ?? null,
    back_body: (row.back_body as CardBody) ?? null,
    hint: (row.hint as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    difficulty: (row.difficulty as string) ?? "medium",
    source: (row.source as string) ?? "Neet Buddy",
    position: Number(row.position ?? 0),
  };
}

/**
 * Loads cards for a deck (in authored `position` order, whole chapter) or a
 * shuffled random mix across every deck when `deck_id` is null.
 */
export async function getFlashcards(input: {
  deck_id?: string | null;
  limit?: number;
}): Promise<{ cards: Flashcard[] }> {
  if (input.deck_id) {
    const { data, error } = await db
      .from("flashcards")
      .select(CARD_COLS)
      .eq("deck_id", input.deck_id)
      .order("position", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const cards = ((data ?? []) as Record<string, unknown>[]).map(normalise);
    return { cards };
  }

  const limit = Math.min(Math.max(input.limit ?? 40, 1), 200);
  const { data, error } = await db.from("flashcards").select(CARD_COLS).limit(1000);
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as Record<string, unknown>[]).map(normalise);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return { cards: list.slice(0, limit) };
}
