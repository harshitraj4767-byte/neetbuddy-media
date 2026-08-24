import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listBookChapters,
  getBookChapter,
  getBookPyqs,
  runsOf,
  resolveBookImage,
  runImageSrc,
  type BookBlock,
  type BookChapter,
  type BookPyq,
} from "@/lib/ncert-book";
import { SiteHeader } from "@/components/site-header";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  AlignLeft,
  ImageIcon,
  Highlighter,
  Search,
  X,
} from "lucide-react";

type Subject = "biology" | "chemistry" | "physics";
const SUBJECTS: { id: Subject; label: string; icon: string }[] = [
  { id: "biology", label: "Biology", icon: "🧬" },
  { id: "chemistry", label: "Chemistry", icon: "⚗️" },
  { id: "physics", label: "Physics", icon: "⚛️" },
];

export const Route = createFileRoute("/highlighted-ncert")({
  head: () => ({
    meta: [
      { title: "Highlighted NCERT E-Book — Neet Buddy" },
      {
        name: "description",
        content:
          "Read full NCERT chapters with PYQ-highlighted lines, diagrams and the previous year questions asked from each line.",
      },
      { property: "og:title", content: "Highlighted NCERT E-Book — Neet Buddy" },
      {
        property: "og:description",
        content: "NCERT chapters with PYQ-highlighted lines, diagrams and related PYQs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
  errorComponent: ({ error }) => (
    <Shell>
      <ErrorBox message={error.message} />
    </Shell>
  ),
});

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <div className="text-sm font-semibold text-destructive">Couldn't load the e-book</div>
      <p className="mt-1 break-words text-xs text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-3 pb-28 pt-4 sm:px-4">{children}</main>
    </div>
  );
}

function Page() {
  const [subject, setSubject] = useState<Subject>("biology");
  const [slug, setSlug] = useState<string | null>(null);

  const chaptersQ = useQuery({
    queryKey: ["ncert-book", "chapters"],
    queryFn: listBookChapters,
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug, subject]);

  if (slug) {
    return (
      <Shell>
        <Reader slug={slug} onBack={() => setSlug(null)} />
      </Shell>
    );
  }

  return (
    <Shell>
      <BookHeader />
      <SubjectTabs value={subject} onChange={setSubject} />
      {chaptersQ.isPending && <Spinner />}
      {chaptersQ.isError && (
        <ErrorBox
          message={(chaptersQ.error as Error).message}
          onRetry={() => chaptersQ.refetch()}
        />
      )}
      {chaptersQ.data && (
        <ChapterList
          chapters={chaptersQ.data.filter((c) => c.subject === subject)}
          subject={subject}
          onPick={setSlug}
        />
      )}
    </Shell>
  );
}

/* ----------------------------- header ----------------------------- */

function BookHeader() {
  return (
    <header className="mb-4 flex items-center gap-3 rounded-2xl border bg-card/80 p-4 shadow-soft backdrop-blur">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/20">
        <BookOpen className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <h1 className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 bg-clip-text text-2xl font-extrabold italic tracking-tight text-transparent sm:text-3xl">
          NCERT E-Book
        </h1>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Highlighted for NEET
        </p>
      </div>
    </header>
  );
}

function SubjectTabs({ value, onChange }: { value: Subject; onChange: (s: Subject) => void }) {
  return (
    <div className="mb-5 grid grid-cols-3 gap-2">
      {SUBJECTS.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={
              "flex items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold transition " +
              (on
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25"
                : "bg-secondary text-muted-foreground hover:bg-secondary/70")
            }
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------- chapter list -------------------------- */

function ChapterList({
  chapters,
  subject,
  onPick,
}: {
  chapters: BookChapter[];
  subject: Subject;
  onPick: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? chapters.filter((c) => c.title.toLowerCase().includes(needle)) : chapters;
  }, [chapters, q]);

  if (chapters.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
        No {subject} chapters published yet.
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chapters"
            className="w-full rounded-full border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500/60"
          />
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {filtered.length}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((c, i) => (
          <li key={c.id}>
            <button
              onClick={() => onPick(c.slug)}
              className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-elegant"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                  {c.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <AlignLeft className="h-3.5 w-3.5" />
                    {c.para_count}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {c.image_count}
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Highlighter className="h-3.5 w-3.5" />
                    {c.highlight_count}
                  </span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------ reader ----------------------------- */

function Reader({ slug, onBack }: { slug: string; onBack: () => void }) {
  const q = useQuery({
    queryKey: ["ncert-book", "chapter", slug],
    queryFn: () => getBookChapter(slug),
    staleTime: 1000 * 60 * 30,
  });
  const [pyqIds, setPyqIds] = useState<number[] | null>(null);
  const [onlyHighlights, setOnlyHighlights] = useState(false);

  const data = q.data;
  const visible = useMemo(() => {
    const blocks = data?.blocks ?? [];
    return onlyHighlights ? blocks.filter((b) => isMarked(b)) : blocks;
  }, [data, onlyHighlights]);

  return (
    <article>
      <div className="sticky top-0 z-20 -mx-3 mb-4 flex items-center gap-2 border-b bg-background/85 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <button
          onClick={onBack}
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Back to chapters"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{q.data?.chapter.title ?? "Loading…"}</div>
          {q.data && (
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {q.data.chapter.subject} · {q.data.chapter.highlight_count} highlights ·{" "}
              {q.data.chapter.pyq_count} PYQs
            </div>
          )}
        </div>
        <button
          onClick={() => setOnlyHighlights((v) => !v)}
          className={
            "rounded-full px-3 py-1.5 text-[11px] font-bold transition " +
            (onlyHighlights
              ? "bg-amber-400 text-amber-950"
              : "bg-secondary text-muted-foreground hover:text-foreground")
          }
        >
          Highlights
        </button>
      </div>

      <Legend />

      {q.isPending && <Spinner />}
      {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {q.data && visible.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          No highlighted lines in this chapter yet.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {visible.map((b) => (
          <Block
            key={b.id}
            block={b}
            subject={data?.chapter.subject}
            onPyq={setPyqIds}
          />
        ))}
      </div>

      {pyqIds && <RelatedPyqSheet ids={pyqIds} onClose={() => setPyqIds(null)} />}
    </article>
  );
}

function isMarked(b: BookBlock) {
  if (b.status === "marked") return true;
  return (b.content ?? []).some((r) => r.t === "hl");
}

function Legend() {
  return (
    <section className="rounded-xl border bg-card/70 px-4 py-3 backdrop-blur">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <li className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-6 rounded bg-yellow-300/70 dark:bg-yellow-400/40" />
          Highlighted line
        </li>
        <li className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-6 rounded bg-amber-400/70 dark:bg-amber-400/40" />
          Asked in a PYQ — tap to open
        </li>
      </ul>
    </section>
  );
}

/** Tidy up text coming from the PDF extraction. */
function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1");
}

function Block({
  block,
  subject,
  onPyq,
}: {
  block: BookBlock;
  subject?: string;
  onPyq: (ids: number[]) => void;
}) {
  const runs = runsOf(block);
  const pyqIds = block.pyq_ids ?? [];
  const hasPyq = pyqIds.length > 0;
  const open = () => hasPyq && onPyq(pyqIds);

  if (block.type === "heading") {
    const level = Math.min(4, Math.max(1, block.level ?? 2));
    const cls =
      level === 1
        ? "mt-9 text-2xl font-extrabold"
        : level === 2
          ? "mt-8 text-xl font-bold"
          : level === 3
            ? "mt-6 text-lg font-bold"
            : "mt-5 text-base font-semibold";
    return (
      <h2 className={`${cls} whitespace-pre-line tracking-tight`}>
        {cleanText(block.text ?? "")}
      </h2>
    );
  }

  if (block.type === "image") {
    return (
      <Figure
        src={resolveBookImage(block.image_url, subject)}
        caption={block.text ?? undefined}
      />
    );
  }

  // Images that were captured inline inside a paragraph are pulled out so they
  // render as real figures instead of stray filenames.
  const figures = runs.filter((r) => r.t === "img" && runImageSrc(r));
  const textRuns = runs.filter((r) => r.t !== "img");
  const hasText = textRuns.some((r) => (r.s ?? "").trim().length > 0);
  // Some PYQ-linked paragraphs have no explicit highlight run stored — mark the
  // whole line so it never looks like an ordinary paragraph.
  const noHlRun = !textRuns.some((r) => r.t === "hl" && (r.s ?? "").trim());
  const markAll = hasPyq && noHlRun;

  const markCls =
    "rounded-[3px] px-0.5 text-foreground decoration-amber-500/60 " +
    (hasPyq
      ? "cursor-pointer bg-amber-300/70 underline decoration-dotted underline-offset-4 hover:bg-amber-300 dark:bg-amber-400/35"
      : "bg-yellow-300/70 dark:bg-yellow-400/30");

  const markProps = {
    role: hasPyq ? ("button" as const) : undefined,
    tabIndex: hasPyq ? 0 : undefined,
    onClick: (e: React.MouseEvent) => {
      if (!hasPyq) return;
      e.stopPropagation();
      open();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (hasPyq && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
  };

  return (
    <div onClick={open} className={hasPyq ? "cursor-pointer" : undefined}>
      {hasPyq && (
        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Related PYQs · {pyqIds.length}
        </span>
      )}
      {hasText && (
        <p className="whitespace-pre-line text-left text-[15px] leading-[1.85] sm:text-base">
          {textRuns.map((r, i) => {
            if (r.t === "br") return <br key={i} />;
            const s = cleanText(r.s ?? "");
            if (!s) return null;
            if (r.t === "hl" || markAll)
              return (
                <mark key={i} {...markProps} className={markCls}>
                  {s}
                </mark>
              );
            return <span key={i}>{s}</span>;
          })}
        </p>
      )}
      {figures.map((r, i) => (
        <Figure key={`f${i}`} src={resolveBookImage(runImageSrc(r), subject)} />
      ))}
      {hasPyq && (
        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-amber-600/80">
          Tap the highlighted line to see the questions asked from it
        </span>
      )}
    </div>
  );
}

function Figure({ src, caption }: { src: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  if (!src || failed) {
    return (
      <figure className="my-4 rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
        <ImageIcon className="mx-auto mb-1 h-5 w-5 opacity-60" />
        {caption ?? "Figure not available"}
      </figure>
    );
  }

  // Never upscale: tiny inline glyphs (arrows, symbols) stay at their natural
  // size, big diagrams are capped so they don't dominate the screen.
  const maxW = dims ? Math.min(dims.w, 640) : undefined;

  return (
    <figure className="my-4 flex flex-col items-center">
      <div
        className="w-full max-w-full overflow-hidden rounded-xl border bg-white"
        style={maxW ? { maxWidth: `${maxW}px` } : undefined}
      >
        <img
          src={src}
          alt={caption ?? "NCERT diagram"}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            const img = e.currentTarget;
            setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className="mx-auto block max-h-[55vh] w-auto max-w-full object-contain"
        />
      </div>
      {caption && (
        <figcaption className="mt-1.5 px-3 text-center text-xs italic text-muted-foreground">
          {cleanText(caption)}
        </figcaption>
      )}
    </figure>
  );
}

/* --------------------------- related PYQs --------------------------- */

function RelatedPyqSheet({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["ncert-book", "pyqs", ids.join(",")],
    queryFn: () => getBookPyqs(ids),
    staleTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Related PYQs</h3>
          <button
            onClick={onClose}
            className="rounded-full bg-secondary p-2 text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {q.isPending && <Spinner />}
        {q.isError && <ErrorBox message={(q.error as Error).message} onRetry={() => q.refetch()} />}
        <div className="space-y-4">
          {(q.data ?? []).map((p) => (
            <PyqCard key={p.unique_id} pyq={p} />
          ))}
        </div>
        {q.data && q.data.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            These questions are no longer available.
          </p>
        )}
      </div>
    </div>
  );
}

function PyqCard({ pyq }: { pyq: BookPyq }) {
  const [show, setShow] = useState(false);
  const options = [
    ["A", pyq.option_a],
    ["B", pyq.option_b],
    ["C", pyq.option_c],
    ["D", pyq.option_d],
  ].filter(([, v]) => !!v) as [string, string][];

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-blue-500/5 to-indigo-500/5 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {pyq.topic_name && (
          <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.topic_name}</span>
        )}
        {pyq.difficulty && (
          <span className="rounded-full bg-secondary px-2 py-0.5">{pyq.difficulty}</span>
        )}
      </div>
      <p className="text-sm font-medium leading-relaxed">{pyq.question}</p>
      {pyq.image_url && (
        <img
          src={resolveBookImage(pyq.image_url, pyq.subject)}
          alt=""
          loading="lazy"
          className="mt-3 w-full rounded-xl border bg-white"
        />
      )}
      {options.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {options.map(([k, v]) => (
            <li key={k} className="flex gap-2 text-sm">
              <span className="font-bold text-muted-foreground">{k}.</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setShow((s) => !s)}
        className="mt-3 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold transition hover:bg-secondary/70"
      >
        {show ? "Hide answer" : "Show answer"}
      </button>
      {show && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          {pyq.answer && (
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">
              Answer: {pyq.answer}
            </div>
          )}
          {pyq.explanation && (
            <p className="mt-1 leading-relaxed text-muted-foreground">{pyq.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}
