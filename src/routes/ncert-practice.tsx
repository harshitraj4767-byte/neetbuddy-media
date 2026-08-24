import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBookPyqs, resolveBookImage, type BookPyq } from "@/lib/ncert-book";
import { SiteHeader } from "@/components/site-header";
import {
  Loader2,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Sparkles,
  RotateCcw,
  BookOpen,
  Trophy,
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
  const letter = raw.replace(/[^a-dA-D]/g, "").slice(0, 1).toUpperCase();
  const opts = optionsOf(p);
  if (raw.length <= 3 && KEYS.includes(letter as Key)) return letter as Key;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const hit = opts.find(([, v]) => norm(v) === norm(raw));
  if (hit) return hit[0];
  return KEYS.includes(letter as Key) ? (letter as Key) : null;
}

function Page() {
  const { ids, slug, block } = Route.useSearch();
  const navigate = useNavigate();
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

  const [picked, setPicked] = useState<Record<number, Key>>({});
  const [i, setI] = useState(0);

  const list = q.data ?? [];
  const total = list.length;
  const current = list[i];
  const score = list.reduce((n, p) => {
    const sel = picked[p.unique_id];
    return sel && sel === correctKeyOf(p) ? n + 1 : n;
  }, 0);
  const answered = list.filter((p) => picked[p.unique_id]).length;
  const done = total > 0 && answered === total;

  const backToLine = () =>
    navigate({
      to: "/highlighted-ncert",
      search: slug ? { slug, block } : {},
    });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-3 pb-28 pt-4 sm:px-4">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={backToLine}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to the line
          </button>
          {slug && (
            <Link
              to="/highlighted-ncert"
              search={{ slug }}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <BookOpen className="h-4 w-4" />
              Chapter
            </Link>
          )}
        </div>

        <header className="mb-5 rounded-2xl border bg-card/80 p-4 shadow-soft backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
                Questions from this line
              </h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Attempt first · explanation after
              </p>
            </div>
          </div>
          {total > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>
                  Question {Math.min(i + 1, total)} of {total}
                </span>
                <span>
                  Score {score}/{total}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
                  style={{ width: `${(answered / total) * 100}%` }}
                />
              </div>
            </>
          )}
        </header>

        {q.isPending && idList.length > 0 && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {(idList.length === 0 || (q.data && total === 0)) && (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No questions are linked to this line yet.
          </p>
        )}

        {q.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        )}

        {current && (
          <QuestionCard
            key={current.unique_id}
            pyq={current}
            index={i}
            picked={picked[current.unique_id]}
            onPick={(k) => setPicked((p) => ({ ...p, [current.unique_id]: k }))}
          />
        )}

        {total > 0 && (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="rounded-full bg-secondary px-4 py-2.5 text-sm font-semibold text-muted-foreground transition disabled:opacity-40"
            >
              Previous
            </button>
            {i < total - 1 ? (
              <button
                onClick={() => setI((n) => Math.min(total - 1, n + 1))}
                className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/25"
              >
                Next question
              </button>
            ) : (
              <button
                onClick={backToLine}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/25"
              >
                Back to reading
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="mt-6 rounded-2xl border bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-5 text-center">
            <Trophy className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            <div className="mt-2 text-lg font-extrabold">
              {score}/{total} correct
            </div>
            <button
              onClick={() => {
                setPicked({});
                setI(0);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-4 py-2 text-xs font-semibold transition hover:bg-secondary/70"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry all
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionCard({
  pyq,
  index,
  picked,
  onPick,
}: {
  pyq: BookPyq;
  index: number;
  picked?: Key;
  onPick: (k: Key) => void;
}) {
  const options = optionsOf(pyq);
  const correct = correctKeyOf(pyq);
  const revealed = !!picked;

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-amber-700 dark:text-amber-300">
          Q{index + 1}
        </span>
        {pyq.topic_name && (
          <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.topic_name}</span>
        )}
        {pyq.difficulty && (
          <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.difficulty}</span>
        )}
      </div>

      <p className="whitespace-pre-line text-[15px] font-semibold leading-relaxed sm:text-base">
        {pyq.question}
      </p>
      {pyq.image_url && (
        <img
          src={resolveBookImage(pyq.image_url, pyq.subject)}
          alt=""
          loading="lazy"
          className="mt-3 w-full rounded-xl border bg-white"
        />
      )}

      <ul className="mt-4 space-y-2.5">
        {options.map(([k, v]) => {
          const isCorrect = revealed && correct === k;
          const isWrongPick = revealed && picked === k && correct !== k;
          const base =
            "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ";
          const state = isCorrect
            ? "border-emerald-500/60 bg-emerald-500/10"
            : isWrongPick
              ? "border-destructive/50 bg-destructive/10"
              : revealed
                ? "opacity-70"
                : "hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-elegant";
          return (
            <li key={k}>
              <button
                type="button"
                disabled={revealed}
                onClick={() => onPick(k)}
                className={base + state}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold">
                  {k}
                </span>
                <span className="min-w-0 flex-1">{v}</span>
                {isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                {isWrongPick && <XCircle className="h-5 w-5 shrink-0 text-destructive" />}
              </button>
            </li>
          );
        })}
      </ul>

      {!revealed && (
        <p className="mt-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Choose an option to see the explanation
        </p>
      )}

      {revealed && (
        <div
          className={
            "mt-4 rounded-2xl border p-4 text-sm " +
            (picked === correct
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5")
          }
        >
          <div className="font-bold">
            {picked === correct ? "Correct!" : "Not quite."}{" "}
            {correct && (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                Answer: {correct}
              </span>
            )}
          </div>
          {pyq.explanation && (
            <p className="mt-1.5 whitespace-pre-line leading-relaxed text-muted-foreground">
              {pyq.explanation}
            </p>
          )}
          {!pyq.explanation && (
            <p className="mt-1.5 text-xs text-muted-foreground">No explanation provided.</p>
          )}
        </div>
      )}
    </section>
  );
}
