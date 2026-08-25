import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBookPyqs, type BookPyq } from "@/lib/ncert-book";
import { saveNcertAnswer } from "@/lib/ncert-progress";
import { useAuth } from "@/hooks/use-auth";
import { SafeRichText } from "@/components/safe-rich-text";
import { NcertPyqImage } from "@/components/ncert-pyq-image";
import {
  Loader2,
  ChevronLeft,
  Star,
  LayoutGrid,
  MoreVertical,
  Trophy,
  RotateCcw,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/ncert-practice")({
  head: () => ({
    meta: [
      { title: "NCERT Line Practice — Neet Buddy" },
      {
        name: "description",
        content:
          "Solve the previous year questions asked from a highlighted NCERT line, one at a time, with instant answers and explanations.",
      },
      { property: "og:title", content: "NCERT Line Practice — Neet Buddy" },
      {
        property: "og:description",
        content: "Attempt the PYQs asked from an NCERT line and read the explanation instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search.ids === "string" ? search.ids : "",
    slug: typeof search.slug === "string" ? search.slug : undefined,
    subject: typeof search.subject === "string" ? search.subject : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
    block:
      search.block != null && !Number.isNaN(Number(search.block))
        ? Number(search.block)
        : undefined,
  }),
  component: Page,
});

const KEYS = ["A", "B", "C", "D"] as const;
type Key = (typeof KEYS)[number];

function optionsOf(p: BookPyq): [Key, string][] {
  return (
    [
      ["A", p.option_a],
      ["B", p.option_b],
      ["C", p.option_c],
      ["D", p.option_d],
    ] as [Key, string | null][]
  ).filter(([, v]) => !!(v ?? "").trim()) as [Key, string][];
}

/** Answers are stored either as a letter ("B", "(b)") or as the option text. */
function correctKeyOf(p: BookPyq): Key | null {
  const raw = (p.answer ?? "").trim();
  if (!raw) return null;
  const letter = raw
    .replace(/[^a-dA-D]/g, "")
    .slice(0, 1)
    .toUpperCase();
  const opts = optionsOf(p);
  if (raw.length <= 3 && KEYS.includes(letter as Key)) return letter as Key;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const hit = opts.find(([, v]) => norm(v) === norm(raw));
  if (hit) return hit[0];
  return KEYS.includes(letter as Key) ? (letter as Key) : null;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Result = { picked: Key | null; correct: boolean };

function Page() {
  const { ids, slug, subject, title, block } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const idList = useMemo(
    () =>
      ids
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n)),
    [ids],
  );

  const q = useQuery({
    queryKey: ["ncert-book", "pyqs", idList.join(",")],
    queryFn: () => getBookPyqs(idList),
    staleTime: 1000 * 60 * 30,
    enabled: idList.length > 0,
  });

  const list = useMemo(() => {
    const rows = q.data ?? [];
    // Keep the order the reading page linked them in.
    const rank = new Map<number, number>(idList.map((id, n) => [Number(id), n]));
    return [...rows].sort(
      (a, b) => (rank.get(Number(a.unique_id)) ?? 0) - (rank.get(Number(b.unique_id)) ?? 0),
    );
  }, [q.data, idList]);

  const [i, setI] = useState(0);
  const [sel, setSel] = useState<Key | null>(null);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [seconds, setSeconds] = useState(0);

  const total = list.length;
  const current = list[i];
  const result = current ? results[current.unique_id] : undefined;
  const revealed = !!result;
  const answered = Object.keys(results).length;
  const score = Object.values(results).filter((r) => r.correct).length;
  const finished = total > 0 && answered === total;

  // Elapsed timer for the whole set.
  useEffect(() => {
    if (total === 0 || finished) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [total, finished]);

  // Reset the pending selection whenever the question changes.
  useEffect(() => {
    setSel(current ? (results[current.unique_id]?.picked ?? null) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, current?.unique_id]);

  const scrollTop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollTop.current?.scrollIntoView({ block: "start" });
  }, [i]);

  /**
   * Go back to the reading page AT THE EXACT LINE this practice set was opened
   * from — the subject, chapter slug and block id all travel back so the reader
   * scrolls to and flashes that paragraph instead of resetting to the top.
   */
  const backToLine = () =>
    navigate({
      to: "/highlighted-ncert",
      search: {
        subject: subject as "biology" | "chemistry" | "physics" | undefined,
        slug: slug || undefined,
        block: slug ? block : undefined,
      },
    });

  const submit = (picked: Key | null) => {
    if (!current || revealed) return;
    const isCorrect = !!picked && picked === correctKeyOf(current);
    setResults((r) => ({ ...r, [current.unique_id]: { picked, correct: isCorrect } }));
    // Persist the attempt so chapter completion on the book page reflects it.
    void saveNcertAnswer({
      userId: user?.id,
      pyqId: current.unique_id,
      chapterSlug: slug ?? null,
      blockId: block ?? null,
      selected: picked,
      isCorrect,
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["ncert-book", "progress"] });
    });
  };

  const next = () => {
    if (i < total - 1) setI(i + 1);
    else backToLine();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ---------------------------- top bar ---------------------------- */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-3 sm:px-4">
          <button
            onClick={backToLine}
            aria-label="Back to the line"
            className="-ml-1 rounded-full p-1.5 text-foreground transition hover:bg-secondary"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">
            {title || "NCERT Practice"}
          </h1>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
            {score * 4} XP
          </span>
          <MoreVertical className="h-5 w-5 shrink-0 text-muted-foreground" />
        </div>

        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 pb-2.5 sm:px-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-500"
              style={{ width: `${total ? (answered / total) * 100 : 0}%` }}
            />
          </div>
          <span className="shrink-0 tabular-nums text-sm font-semibold text-muted-foreground">
            {fmt(seconds)}
          </span>
        </div>
      </header>

      {/* ----------------------------- body ------------------------------ */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-40 pt-5">
        <div ref={scrollTop} />

        {q.isPending && idList.length > 0 && (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {q.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        )}

        {!q.isPending && !q.isError && total === 0 && (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No questions are linked to this line yet.
          </p>
        )}

        {current && (
          <>
            <div className="mb-5 flex items-center gap-3">
              <LayoutGrid className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight">Question</h2>
              <span className="ml-auto text-sm font-semibold text-muted-foreground">
                {i + 1}/{total}
              </span>
            </div>

            <QuestionCard
              key={current.unique_id}
              pyq={current}
              subject={current.subject || subject}
              selected={sel}
              revealed={revealed}
              onSelect={setSel}
            />
          </>
        )}

        {finished && (
          <div className="mt-8 rounded-2xl border bg-card p-6 text-center shadow-soft">
            <Trophy className="mx-auto h-8 w-8 text-amber-500" />
            <div className="mt-2 text-xl font-extrabold">
              {score}/{total} correct
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Time taken {fmt(seconds)}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => {
                  setResults({});
                  setSel(null);
                  setI(0);
                  setSeconds(0);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-xs font-semibold transition hover:bg-secondary/70"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry all
              </button>
              <button
                onClick={backToLine}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Back to reading
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ---------------------------- footer ----------------------------- */}
      {current && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {!revealed ? (
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-3 px-4 py-3">
              <button
                onClick={() => submit(null)}
                className="min-w-[9rem] rounded-lg border-2 border-primary/70 px-5 py-3 text-base font-semibold text-primary transition hover:bg-primary/5"
              >
                Don't Know
              </button>
              <button
                onClick={() => submit(sel)}
                disabled={!sel}
                className="min-w-[9rem] rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground transition disabled:opacity-40"
              >
                Submit
              </button>
            </div>
          ) : (
            <button
              onClick={next}
              className="relative flex w-full items-center justify-center gap-4 bg-secondary px-4 py-4 text-base font-semibold text-foreground"
            >
              <span className="mx-auto">
                {i < total - 1 ? "Tap to continue" : "Back to reading"}
              </span>
              <span className="absolute right-5 tabular-nums text-muted-foreground">
                {i + 1}/{total}
              </span>
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

/* --------------------------- question card --------------------------- */

function QuestionCard({
  pyq,
  subject,
  selected,
  revealed,
  onSelect,
}: {
  pyq: BookPyq;
  subject?: string | null;
  selected: Key | null;
  revealed: boolean;
  onSelect: (k: Key) => void;
}) {
  const options = optionsOf(pyq);
  const correct = correctKeyOf(pyq);

  return (
    <section>
      <div className="rich-html text-[17px] leading-relaxed">
        <SafeRichText>{pyq.question}</SafeRichText>
      </div>
      <NcertPyqImage src={pyq.image_url} subject={subject} />

      <ul className="mt-6 space-y-3">
        {options.map(([k, v], n) => {
          const isPicked = selected === k;
          const isCorrect = revealed && correct === k;
          const isWrong = revealed && isPicked && correct !== k;
          const border = isCorrect
            ? "border-emerald-500 bg-emerald-500/8"
            : isWrong
              ? "border-destructive bg-destructive/8"
              : isPicked
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/40";
          return (
            <li key={k}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => onSelect(k)}
                className={`flex w-full items-center gap-4 rounded-xl border px-3 py-4 text-left transition ${border}`}
              >
                <span className="w-5 shrink-0 text-center text-base font-semibold text-muted-foreground">
                  {n + 1}
                </span>
                <span className="rich-html min-w-0 flex-1 text-[16px] font-medium leading-snug">
                  <SafeRichText>{v}</SafeRichText>
                </span>
                <span
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 " +
                    (isCorrect
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isWrong
                        ? "border-destructive bg-destructive text-white"
                        : isPicked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40")
                  }
                >
                  {isCorrect && <Check className="h-4 w-4" />}
                  {isWrong && <X className="h-4 w-4" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {revealed && (
        <div className="mt-5 rounded-xl border bg-card p-4">
          <div className="text-sm font-bold">
            {selected && selected === correct ? (
              <span className="text-emerald-600 dark:text-emerald-400">Correct</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                {correct ? `Correct answer: ${correct}` : "Answer not recorded"}
              </span>
            )}
          </div>
          {pyq.explanation ? (
            <div className="rich-html mt-2 text-sm leading-relaxed text-muted-foreground">
              <SafeRichText>{pyq.explanation}</SafeRichText>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No explanation provided.</p>
          )}
          {(pyq.topic_name || pyq.difficulty) && (
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {pyq.topic_name && (
                <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.topic_name}</span>
              )}
              {pyq.difficulty && (
                <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.difficulty}</span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
