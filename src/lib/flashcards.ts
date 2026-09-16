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

export async function getFlashcards(opts: {
  deckId?: string | null;
  subject?: string;
  limit?: number;
  offset?: number;
}): Promise<Flashcard[]> {
  const { deckId, subject, limit = 100, offset = 0 } = opts;
  try {
    const params = new URLSearchParams({ action: "cards", limit: String(limit), offset: String(offset) });
    if (deckId) params.set("deck_id", deckId);
    if (subject) params.set("subject", subject);

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
