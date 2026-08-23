import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Layers, RotateCcw, ArrowRight, Sparkles } from "lucide-react";
import { recordFlashcardReview } from "@/lib/flashcards.functions";
import { listFlashcardDecks, getFlashcards, type Deck, type Flashcard } from "@/lib/flashcards";
import { accessStudyFeature } from "@/lib/feature-gate.functions";
import { useAuth } from "@/hooks/use-auth";
import { RichText } from "@/components/rich-text";
import { toast } from "sonner";
import { FeatureLock } from "@/components/feature-lock";

export const Route = createFileRoute("/flashcards")({
  head: () => ({ meta: [{ title: "Flashcards — Neet Buddy" }] }),
  component: () => (<FeatureLock feature="flashcards"><FlashcardsPage /></FeatureLock>),
});

function FlashcardsPage() {
  const { user } = useAuth();
  const review = useServerFn(recordFlashcardReview);
  const unlock = useServerFn(accessStudyFeature);

  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    listFlashcardDecks().then((d) => { setDecks(d.decks); setTotal(d.totalCards); }).catch((e) => toast.error(e?.message ?? "Failed to load"));
  }, []);

  async function start(d: Deck | null) {
    if (!user) { toast.error("Please log in to study flashcards."); return; }
    setStarting(true);
    try {
      if (!unlocked) {
        await unlock({ data: { feature: "flashcards" } });
        setUnlocked(true);
      }
    } catch (e: any) {
      setStarting(false);
      toast.error(e?.message ?? "Could not unlock flashcards");
      return;
    }
    setActive(d); setCards(null); setIdx(0); setFlipped(false); setDone(false);
    try {
      const r = await getFlashcards({ chapter_id: d?.chapter_id ?? null, subject_id: d?.subject_id ?? null, limit: 30 });
      setCards(r.cards);
      if (r.cards.length === 0) toast.info("No cards in this deck yet.");
    } catch (e: any) { toast.error(e?.message ?? "Failed to load cards"); }
    finally { setStarting(false); }
  }

  async function rate(rating: 1 | 2 | 3) {
    if (!cards || !cards[idx]) return;
    const card = cards[idx];
    if (user) { try { await review({ data: { card_id: card.id, rating } }); } catch { /* silent */ } }
    if (idx + 1 >= cards.length) { setDone(true); return; }
    setIdx(idx + 1); setFlipped(false);
  }

  function next() {
    if (!cards) return;
    if (idx + 1 >= cards.length) { setDone(true); return; }
    setIdx(idx + 1); setFlipped(false);
  }


  if (active) {
    const card = cards?.[idx];
    return (
      <PageShell>
        <div className="-mt-2 mb-3 flex items-center justify-between">
          <button onClick={() => { setActive(null); setCards(null); }} className="text-sm font-semibold text-primary">← Back to decks</button>
          {cards && <div className="text-xs font-semibold text-muted-foreground">{Math.min(idx + 1, cards.length)} / {cards.length}</div>}
        </div>
        <div className="mb-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{active.subject_name}</div>
          <h1 className="mt-0.5 text-xl font-bold">{active.chapter_name}</h1>
        </div>

        {cards === null ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : done ? (
          <Card className="border-0 shadow-elegant">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-gradient-primary shadow-glow" />
              <div className="text-lg font-bold">Session complete</div>
              <p className="mt-1 text-sm text-muted-foreground">You reviewed {cards.length} cards.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => start(active)} className="bg-gradient-primary"><RotateCcw className="mr-1.5 h-4 w-4" />Again</Button>
                <Button variant="outline" onClick={() => { setActive(null); setCards(null); }}>Done</Button>
              </div>
            </CardContent>
          </Card>
        ) : card ? (
          <>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="block w-full"
              aria-label="Flip card"
            >
              <Card className={`min-h-[280px] border-0 shadow-elegant transition-transform ${flipped ? "bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-500/10 dark:to-sky-500/10" : "bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-500/10 dark:to-fuchsia-500/10"}`}>
                <CardContent className="flex min-h-[280px] flex-col p-6 text-left">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{flipped ? "Answer" : "Question"}</div>
                  <div className="mt-3 flex-1 text-base leading-relaxed">
                    <RichText>{flipped ? card.back : card.front}</RichText>
                  </div>
                  <div className="mt-4 text-center text-xs font-medium text-muted-foreground">{flipped ? "Tap to flip back" : "Tap to reveal answer"}</div>
                </CardContent>
              </Card>
            </button>
            {flipped && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">Card level</span>
                  <DifficultyPill level={card.difficulty} />
                </div>
                <div className="text-center text-[11px] font-medium text-muted-foreground">How well did you know it?</div>
                <div className="grid grid-cols-3 gap-2">
                  <Button onClick={() => rate(3)} className="bg-emerald-500 text-white hover:bg-emerald-600">Easy</Button>
                  <Button onClick={() => rate(2)} className="bg-amber-500 text-white hover:bg-amber-600">Medium</Button>
                  <Button onClick={() => rate(1)} className="bg-rose-500 text-white hover:bg-rose-600">Hard</Button>
                </div>
                <Button variant="outline" onClick={next} className="w-full">
                  Next <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            )}
            {!flipped && (
              <div className="mt-4">
                <Button onClick={() => setFlipped(true)} className="w-full bg-gradient-primary">Show answer <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              </div>
            )}
          </>
        ) : null}
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="Memory" title="Flashcards" description="Flip & review high-yield NEET concepts. Track your recall with Again / Good / Easy.">
      {decks === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : decks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
            No flashcards yet. An admin can generate them in the Admin Panel → Flashcards tab.
            <div className="mt-3"><Button asChild variant="outline" size="sm"><Link to="/dashboard">Back to dashboard</Link></Button></div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 border-0 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total deck</div>
                <div className="text-2xl font-extrabold">{total} cards</div>
              </div>
              <Button onClick={() => start({ subject_id: null, subject_name: "All Subjects", chapter_id: null, chapter_name: "Random mix", count: total })} className="bg-gradient-primary">
                Random review <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {decks.map((d) => (
              <button key={`${d.subject_id}-${d.chapter_id}`} onClick={() => start(d)} className="text-left">
                <Card className="border-border transition-transform hover:-translate-y-0.5 hover:shadow-elegant">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-md">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{d.subject_name}</div>
                      <div className="truncate text-sm font-bold">{d.chapter_name}</div>
                      <div className="text-xs text-muted-foreground">{d.count} cards</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}

function DifficultyPill({ level }: { level: string }) {
  const l = (level ?? "medium").toLowerCase();
  const styles =
    l === "easy"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : l === "hard"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  const label = l.charAt(0).toUpperCase() + l.slice(1);
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${styles}`}>{label}</span>;
}
