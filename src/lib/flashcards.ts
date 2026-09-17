// Data access for Flashcards, Hostinger PHP API edition.
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

export async function listFlashcardDecks(): Promise<{ decks: Deck[]; totalCards: number }> {
  try {
    const res = await fetch("/api/flashcards.php?action=decks");
    if (res.ok) {
      const data = await res.json();
      return {
        decks: Array.isArray(data.decks) ? data.decks : [],
        totalCards: Number(data.totalCards || 0),
      };
    }
  } catch (e) {
    console.warn("listFlashcardDecks failed:", e);
  }
  return { decks: [], totalCards: 0 };
}

export type GetFlashcardsOpts = {
  deckId?: string | null;
  /** Accepted as an alias so callers can use either casing. */
  deck_id?: string | null;
  subject?: string | null;
  random?: boolean;
  limit?: number;
  offset?: number;
};

export async function getFlashcards(opts: GetFlashcardsOpts): Promise<Flashcard[]> {
  const deckId = opts.deckId ?? opts.deck_id ?? null;
  const { subject, random, limit = 100, offset = 0 } = opts;
  try {
    const params = new URLSearchParams({
      action: "cards",
      limit: String(limit),
      offset: String(offset),
    });
    if (deckId) params.set("deck_id", deckId);
    if (subject) params.set("subject", subject);
    // No deck picked = "random mix", so let the API shuffle.
    if (random ?? !deckId) params.set("random", "1");

    const res = await fetch(`/api/flashcards.php?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.cards) ? data.cards : [];
    }
  } catch (e) {
    console.warn("getFlashcards failed:", e);
  }
  return [];
}

/** Best-effort recall tracking through the Hostinger API. */
export async function saveFlashcardReview(cardId: string, rating: 1 | 2 | 3): Promise<void> {
  try {
    await fetch("/api/flashcards.php?action=review", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_id: cardId, rating }),
    });
  } catch (e) {
    console.warn("saveFlashcardReview failed:", e);
  }
}
