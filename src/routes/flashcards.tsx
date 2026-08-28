import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MissionBanner } from "@/components/mission-banner";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { HubHero } from "@/components/nav-tiles";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Layers,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Search,
  Shuffle,
  Lightbulb,
  Tag,
  Sparkles,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { recordFlashcardReview } from "@/lib/flashcards.functions";
import {
  listFlashcardDecks,
  getFlashcards,
  type Deck,
  type Flashcard,
  type CardBody,
} from "@/lib/flashcards";
import { accessStudyFeature } from "@/lib/feature-gate.functions";
import { useAuth } from "@/hooks/use-auth";
import { RichText } from "@/components/rich-text";
import { toast } from "sonner";
import { FeatureLock } from "@/components/feature-lock";

type Subject = "biology" | "chemistry" | "physics";
const SUBJECTS: { id: Subject; label: string; icon: string }[] = [
  { id: "biology", label: "Biology", icon: "🧬" },
  { id: "chemistry", label: "Chemistry", icon: "⚗️" },
  { id: "physics", label: "Physics", icon: "⚛️" },
];

export const Route = createFileRoute("/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — Neet Buddy" },
      {
        name: "description",
        content:
          "Chapter-wise NEET flashcards with hints, diagrams and swipe-to-rate recall tracking.",
      },
      { property: "og:title", content: "Flashcards — Neet Buddy" },
      {
        property: "og:description",
        content: "Chapter-wise NEET flashcards with hints, diagrams and swipe-to-rate recall.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    subject: typeof search.subject === "string" ? (search.subject as Subject) : undefined,
  }),
  component: () => (
    <FeatureLock feature="flashcards">
      <FlashcardsPage />
    </FeatureLock>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-4">
        <MissionBanner />
        {children}
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function FlashcardsPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/flashcards" });
  const subject: Subject = search.subject ?? "biology";
  const unlock = useServerFn(accessStudyFeature);

  const [active, setActive] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [starting, setStarting] = useState(false);
  const unlockedRef = useRef(false);

  const decksQ = useQuery({
    queryKey: ["flashcards", "decks"],
    queryFn: listFlashcardDecks,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active?.id, subject]);

  async function start(d: Deck) {
    if (!user) {
      toast.error("Please log in to study flashcards.");
      return;
    }
    setStarting(true);
    try {
      if (!unlockedRef.current) {
        await unlock({ data: { feature: "flashcards" } });
        unlockedRef.current = true;
      }
    } catch (e: any) {
      setStarting(false);
      toast.error(e?.message ?? "Could not unlock flashcards");
      return;
    }
    setActive(d);
    setCards(null);
    try {
      const r = await getFlashcards({ deck_id: d.id, limit: 40 });
      setCards(r.cards);
      if (r.cards.length === 0) toast.info("No cards in this deck yet.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load cards");
    } finally {
      setStarting(false);
    }
  }

  function exit() {
    setActive(null);
    setCards(null);
  }

  if (active) {
    return (
      <Shell>
        <Reviewer deck={active} cards={cards} onExit={exit} onRestart={() => start(active)} />
      </Shell>
    );
  }

  const decks = decksQ.data?.decks ?? [];
  const total = decksQ.data?.totalCards ?? 0;
  const bySubject = decks.filter((d) => d.subject.toLowerCase() === subject);

  return (
    <Shell>
      <HubHero
        eyebrow="Memory"
        title="Flashcards"
        description="Chapter-wise decks across Biology, Chemistry and Physics. Flip, peek at the hint, then swipe to rate your recall."
        Icon={Layers}
        accent="violet"
        variant="banner"
        compact
        image="/illustrations/i3d-flashcards.png"
        imageAlt="Flashcards"
      />

      {decksQ.isPending && <Spinner />}
      {decksQ.isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <div className="text-sm font-semibold text-destructive">Couldn't load flashcards</div>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {(decksQ.error as Error).message}
          </p>
          <button
            onClick={() => decksQ.refetch()}
            className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      )}

      {decksQ.data && decks.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
          No flashcards yet. An admin can generate them in the Admin Panel → Flashcards tab.
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}

      {decksQ.data && decks.length > 0 && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2">
            {SUBJECTS.map((s) => {
              const on = s.id === subject;
              const count = decks
                .filter((d) => d.subject.toLowerCase() === s.id)
                .reduce((n, d) => n + d.count, 0);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate({ search: { subject: s.id } })}
                  className={
                    "flex flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-2.5 text-sm font-semibold transition " +
                    (on
                      ? "bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-md shadow-violet-500/25"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70")
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </span>
                  <span className={"text-[11px] font-medium " + (on ? "text-white/80" : "")}>
                    {count} cards
                  </span>
                </button>
              );
            })}
          </div>

          <ChapterList
            decks={bySubject}
            subject={subject}
            total={total}
            starting={starting}
            onPick={start}
            onRandom={() =>
              start({
                id: null,
                title: "Random mix",
                subject: "All subjects",
                description: null,
                count: total,
              })
            }
          />
        </>
      )}
    </Shell>
  );
}

/* ---------------------------- chapter list ---------------------------- */

function ChapterList({
  decks,
  subject,
  total,
  starting,
  onPick,
  onRandom,
}: {
  decks: Deck[];
  subject: Subject;
  total: number;
  starting: boolean;
  onPick: (d: Deck) => void;
  onRandom: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? decks.filter((d) => d.title.toLowerCase().includes(needle)) : decks;
  }, [decks, q]);

  return (
    <section>
      <button
        onClick={onRandom}
        disabled={starting}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-transparent bg-gradient-to-br from-violet-100 via-fuchsia-50 to-indigo-100 p-4 text-left shadow-soft transition hover:-translate-y-0.5 disabled:opacity-60 dark:from-violet-950/60 dark:via-fuchsia-950/40 dark:to-indigo-950/60"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md">
          <Shuffle className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Random review</span>
          <span className="block text-xs text-muted-foreground">
            Mixed cards from all {total} in the bank
          </span>
        </span>
        {starting ? (
          <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
        )}
      </button>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chapters"
            className="w-full rounded-full border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500/60"
          />
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {filtered.length}
        </span>
      </div>

      {decks.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
          No {subject} decks published yet.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((d, i) => (
            <li key={d.id ?? d.title}>
              <button
                onClick={() => onPick(d)}
                disabled={starting}
                className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-violet-500/50 hover:shadow-elegant disabled:opacity-60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-sm font-bold text-violet-600 dark:text-violet-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold group-hover:text-violet-600 dark:group-hover:text-violet-400">
                    {d.title}
                  </span>
                  {d.description && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {d.description}
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    {d.count} cards
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ reviewer ------------------------------ */

const RATING_LABEL: Record<1 | 2 | 3, string> = { 1: "Again", 2: "Good", 3: "Easy" };

function Reviewer({
  deck,
  cards,
  onExit,
  onRestart,
}: {
  deck: Deck;
  cards: Flashcard[] | null;
  onExit: () => void;
  onRestart: () => void;
}) {
  const { user } = useAuth();
  const review = useServerFn(recordFlashcardReview);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [ratings, setRatings] = useState<Array<1 | 2 | 3>>([]);
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
    setRatings([]);
  }, [deck.id, cards]);

  if (cards === null) {
    return (
      <>
        <ReviewerBar deck={deck} onExit={onExit} idx={0} total={0} />
        <Spinner />
      </>
    );
  }

  const total = cards.length;
  const done = idx >= total;

  function advance() {
    setFlipped(false);
    setShowHint(false);
    setDrag(0);
    setIdx((i) => i + 1);
  }

  async function rate(r: 1 | 2 | 3) {
    const card = cards![idx];
    if (!card) return;
    setRatings((prev) => [...prev, r]);
    if (user) {
      try {
        await review({ data: { card_id: card.id, rating: r } });
      } catch {
        /* silent — recall tracking is best-effort */
      }
    }
    advance();
  }

  function back() {
    if (idx === 0) return;
    setRatings((prev) => prev.slice(0, -1));
    setFlipped(false);
    setShowHint(false);
    setDrag(0);
    setIdx((i) => i - 1);
  }

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return;
    setDrag(e.clientX - startX.current);
  }
  function onPointerUp() {
    if (startX.current === null) return;
    const dx = drag;
    startX.current = null;
    if (dx <= -90) {
      void rate(1);
      return;
    }
    if (dx >= 90) {
      void rate(3);
      return;
    }
    setDrag(0);
  }

  if (done) {
    const easy = ratings.filter((r) => r === 3).length;
    const good = ratings.filter((r) => r === 2).length;
    const again = ratings.filter((r) => r === 1).length;
    return (
      <>
        <ReviewerBar deck={deck} onExit={onExit} idx={total} total={total} />
        <div className="rounded-3xl border bg-card p-8 text-center shadow-elegant">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <div className="mt-3 text-lg font-bold">Session complete</div>
          <p className="mt-1 text-sm text-muted-foreground">
            You reviewed {total} {total === 1 ? "card" : "cards"} from {deck.title}.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-left">
            <Stat label="Easy" value={easy} tone="emerald" />
            <Stat label="Good" value={good} tone="amber" />
            <Stat label="Again" value={again} tone="rose" />
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={onRestart} className="bg-gradient-to-r from-violet-500 to-fuchsia-600">
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Review again
            </Button>
            <Button variant="outline" onClick={onExit}>
              Back to chapters
            </Button>
          </div>
        </div>
      </>
    );
  }

  const card = cards[idx];
  if (!card) {
    return (
      <>
        <ReviewerBar deck={deck} onExit={onExit} idx={0} total={total} />
        <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
          No cards in this deck yet.
        </div>
      </>
    );
  }

  const next = cards[idx + 1];
  const rotate = drag / 22;
  const swipeHint = drag <= -60 ? 1 : drag >= 60 ? 3 : 0;

  return (
    <>
      <ReviewerBar deck={deck} onExit={onExit} idx={idx} total={total} />

      <div className="relative mx-auto mt-2 max-w-xl select-none" style={{ touchAction: "pan-y" }}>
        {/* stacked peek cards behind the active one */}
        {cards[idx + 2] && (
          <div className="absolute inset-x-6 top-3 h-full rounded-3xl border bg-card/60 shadow-soft" />
        )}
        {next && (
          <div className="absolute inset-x-3 top-1.5 h-full rounded-3xl border bg-card/80 shadow-soft" />
        )}

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            if (Math.abs(drag) < 6) setFlipped((f) => !f);
          }}
          className="relative cursor-pointer rounded-3xl border bg-card shadow-elegant"
          style={{
            transform: `translateX(${drag}px) rotate(${rotate}deg)`,
            transition: startX.current === null ? "transform 220ms ease" : "none",
          }}
        >
          <div className="flex min-h-[340px] flex-col p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-violet-500/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                {flipped ? "Answer" : "Question"}
              </span>
              <div className="flex items-center gap-1.5">
                <DifficultyPill level={card.difficulty} />
                <span className="text-[10px] font-medium text-muted-foreground">{card.source}</span>
              </div>
            </div>

            <div className="mt-4 flex-1 text-[15px] leading-relaxed">
              <CardFace
                text={flipped ? card.back : card.front}
                body={flipped ? card.back_body : card.front_body}
              />
            </div>

            {!flipped && card.hint && (
              <div className="mt-4">
                {showHint ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                      <Lightbulb className="h-3.5 w-3.5" /> Hint
                    </div>
                    <RichText className="text-amber-900 dark:text-amber-100">{card.hint}</RichText>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowHint(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"
                  >
                    <Lightbulb className="h-3.5 w-3.5" /> Show hint
                  </button>
                )}
              </div>
            )}

            {card.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                <Tag className="h-3 w-3 text-muted-foreground" />
                {card.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 text-center text-[11px] font-medium text-muted-foreground">
              {flipped ? "Swipe ← Again · Easy → · tap to flip back" : "Tap the card to reveal the answer"}
            </div>
          </div>

          {swipeHint !== 0 && (
            <div
              className={
                "pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl text-2xl font-extrabold uppercase tracking-widest " +
                (swipeHint === 1
                  ? "bg-rose-500/15 text-rose-600"
                  : "bg-emerald-500/15 text-emerald-600")
              }
            >
              {RATING_LABEL[swipeHint as 1 | 3]}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-xl">
        {flipped ? (
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={() => rate(1)} className="bg-rose-500 text-white hover:bg-rose-600">
              Again
            </Button>
            <Button onClick={() => rate(2)} className="bg-amber-500 text-white hover:bg-amber-600">
              Good
            </Button>
            <Button
              onClick={() => rate(3)}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              Easy
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setFlipped(true)}
            className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-600"
          >
            Show answer
          </Button>
        )}
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={back}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" /> Previous card
          </button>
          <button
            onClick={advance}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
          >
            Skip <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}

function ReviewerBar({
  deck,
  onExit,
  idx,
  total,
}: {
  deck: Deck;
  onExit: () => void;
  idx: number;
  total: number;
}) {
  const pct = total ? Math.round((idx / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400"
        >
          <ChevronLeft className="h-4 w-4" /> Chapters
        </button>
        <div className="text-xs font-semibold text-muted-foreground">
          {Math.min(idx + 1, Math.max(total, 1))} / {total}
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
          {deck.subject}
        </div>
        <h1 className="mt-0.5 text-lg font-bold">{deck.title}</h1>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Renders the plain text plus every block stored in front_body / back_body. */
function CardFace({ text, body }: { text: string; body: CardBody }) {
  const blocks = body?.content ?? [];
  const textBlocks = blocks.filter((b) => b.type === "text").map((b) => b.value);
  const extra = blocks.filter((b) => b.type !== "text");
  // Avoid printing the same sentence twice when the body repeats `front`/`back`.
  const duplicated = textBlocks.some((t) => t.trim() === text.trim());

  return (
    <div className="space-y-3">
      <RichText>{text}</RichText>
      {!duplicated &&
        textBlocks.map((t, i) => (
          <div key={`t${i}`}>
            <RichText>{t}</RichText>
          </div>
        ))}
      {extra.map((b, i) =>
        b.type === "svg" ? (
          <div
            key={`b${i}`}
            className="overflow-x-auto rounded-2xl border bg-white p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: b.value }}
          />
        ) : b.type === "image" ? (
          <img
            key={`b${i}`}
            src={b.value}
            alt=""
            className="mx-auto max-h-64 rounded-2xl border bg-white object-contain"
          />
        ) : (
          <div key={`b${i}`}>
            <RichText>{b.value}</RichText>
          </div>
        ),
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const styles: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  };
  return (
    <div className={"rounded-2xl p-3 " + styles[tone]}>
      <div className="text-xl font-extrabold">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wider">{label}</div>
    </div>
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
