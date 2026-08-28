import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MissionBanner } from "@/components/mission-banner";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listBookChapters,
  getBookChapter,
  runsOf,
  resolveBookImage,
  runImageSrc,
  type BookBlock,
  type BookChapter,
} from "@/lib/ncert-book";
import { SiteHeader } from "@/components/site-header";
import { HubHero } from "@/components/nav-tiles";
import { getNcertProgress } from "@/lib/ncert-progress";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Highlighter,
  ImageIcon,
  HelpCircle,
  CheckCircle2,
  Search,
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
      { title: "Highlighted NCERT — Neet Buddy" },
      {
        name: "description",
        content:
          "Read full NCERT chapters with PYQ-highlighted lines, diagrams and the previous year questions asked from each line.",
      },
      { property: "og:title", content: "Highlighted NCERT — Neet Buddy" },
      {
        property: "og:description",
        content: "NCERT chapters with PYQ-highlighted lines, diagrams and related PYQs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    subject: typeof search.subject === "string" ? (search.subject as Subject) : undefined,
    slug: typeof search.slug === "string" ? search.slug : undefined,
    block:
      search.block != null && !Number.isNaN(Number(search.block))
        ? Number(search.block)
        : undefined,
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
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-4">
        <MissionBanner />
        {children}
      </main>
    </div>
  );
}

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/highlighted-ncert" });
  const subject: Subject = search.subject ?? "biology";
  const slug = search.slug ?? null;

  const setSubject = (s: Subject) =>
    navigate({ search: { subject: s, slug: undefined, block: undefined } });
  const setSlug = (s: string | null) =>
    navigate({ search: { subject, slug: s ?? undefined, block: undefined } });

  const chaptersQ = useQuery({
    queryKey: ["ncert-book", "chapters"],
    queryFn: listBookChapters,
    staleTime: 1000 * 60 * 30,
  });

  const { user } = useAuth();
  const progressQ = useQuery({
    queryKey: ["ncert-book", "progress", user?.id ?? "guest"],
    queryFn: () => getNcertProgress(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (!search.block) window.scrollTo({ top: 0 });
  }, [slug, subject, search.block]);

  if (slug) {
    return (
      <Shell>
        <Reader slug={slug} focusBlock={search.block} onBack={() => setSlug(null)} />
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
          progress={progressQ.data ?? {}}
          onPick={setSlug}
        />
      )}
    </Shell>
  );
}

/* ----------------------------- header ----------------------------- */

function BookHeader() {
  return (
    <HubHero
      eyebrow="NCERT + PYQ"
      title="Highlighted NCERT"
      description="Every NCERT line that has ever been asked in NEET, marked inside the chapter — with all the PYQs from that line ready to practise."
      Icon={Highlighter}
      accent="amber"
      variant="banner"
      compact
      image="/illustrations/i3d-highlighted-ncert.png"
      imageAlt="Highlighted NCERT book"
    />
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
  progress,
  onPick,
}: {
  chapters: BookChapter[];
  subject: Subject;
  /** chapter_slug -> distinct questions attempted by the signed-in user. */
  progress: Record<string, number>;
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
                <ChapterProgress total={c.pyq_count} solved={progress[c.slug] ?? 0} />
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Question-based completion: attempted PYQs / total PYQs in the chapter. */
function ChapterProgress({ total, solved }: { total: number; solved: number }) {
  if (!total) {
    return (
      <span className="mt-1 block text-xs text-muted-foreground">Questions coming soon</span>
    );
  }
  const done = Math.min(solved, total);
  const pct = Math.round((done / total) * 100);
  const complete = done >= total;
  return (
    <span className="mt-1.5 block">
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <HelpCircle className="h-3.5 w-3.5" />
          {total} questions
        </span>
        <span
          className={
            "inline-flex items-center gap-1 font-semibold " +
            (complete ? "text-emerald-600 dark:text-emerald-400" : "")
          }
        >
          {complete && <CheckCircle2 className="h-3.5 w-3.5" />}
          {done}/{total} · {pct}%
        </span>
      </span>
      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <span
          className={
            "block h-full rounded-full transition-all " +
            (complete
              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
              : "bg-gradient-to-r from-amber-500 to-orange-500")
          }
          style={{ width: `${Math.max(pct, done > 0 ? 4 : 0)}%` }}
        />
      </span>
    </span>
  );
}

/* ------------------------------ reader ----------------------------- */

function Reader({
  slug,
  focusBlock,
  onBack,
}: {
  slug: string;
  focusBlock?: number;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["ncert-book", "chapter", slug],
    queryFn: () => getBookChapter(slug),
    staleTime: 1000 * 60 * 30,
  });
  const [onlyHighlights, setOnlyHighlights] = useState(false);

  const openPractice = (ids: number[], blockId: number) =>
    navigate({
      to: "/ncert-practice",
      // Carry the subject + block id so "back" returns to this exact line.
      search: {
        ids: ids.join(","),
        slug,
        block: blockId,
        subject: q.data?.chapter.subject,
        title: q.data?.chapter.title,
      },
    });

  const data = q.data;

  // Returning from the practice page must land on the exact line the user left
  // from, not the top of the chapter. The paragraph may not be painted yet when
  // the query resolves (images/long chapters), so poll for a few frames before
  // giving up, then scroll instantly and flash the line.
  useEffect(() => {
    if (!focusBlock || !data) return;
    let raf = 0;
    let tries = 0;
    let cleanupFlash: (() => void) | undefined;

    const attempt = () => {
      const el = document.getElementById(`blk-${focusBlock}`);
      if (!el) {
        if (tries++ < 120) raf = requestAnimationFrame(attempt);
        return;
      }
      el.scrollIntoView({ behavior: "auto", block: "center" });
      el.classList.add("ring-2", "ring-amber-400", "rounded-xl");
      // A second pass after layout settles (lazy images shift the page).
      const settle = setTimeout(
        () => el.scrollIntoView({ behavior: "auto", block: "center" }),
        350,
      );
      const clear = setTimeout(
        () => el.classList.remove("ring-2", "ring-amber-400", "rounded-xl"),
        2600,
      );
      cleanupFlash = () => {
        clearTimeout(settle);
        clearTimeout(clear);
      };
    };

    raf = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(raf);
      cleanupFlash?.();
    };
  }, [focusBlock, data]);

  const visible = useMemo(() => {
    const blocks = data?.blocks ?? [];
    if (!onlyHighlights) return blocks;
    return blocks.filter((b) => isMarked(b) || b.id === focusBlock);
  }, [data, onlyHighlights, focusBlock]);

  return (
    <article>
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 border-b bg-background/85 px-4 py-2.5 backdrop-blur">
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

      {q.data && visible.length > 0 && (
        <div className="paper-card -mx-4 mt-6 px-4 py-7 sm:mx-0 sm:px-8 sm:py-10">
          <header className="paper-measure mb-7 border-b border-[color:var(--paper-rule)] pb-5">
            <div className="paper-meta flex items-center justify-between gap-3 text-[11px] font-semibold">
              <span>NCERT · {q.data.chapter.subject}</span>
              <span>{q.data.chapter.pyq_count} questions ahead</span>
            </div>
            <h1 className="paper-display mt-3 text-[26px] font-bold leading-tight sm:text-4xl">
              {q.data.chapter.title}
            </h1>
            <p className="paper-muted mt-2 text-xs">
              {q.data.chapter.highlight_count} highlighted lines in this chapter
            </p>
          </header>
          <div className="paper-measure paper-body space-y-4">
            {visible.map((b) => (
              <Block
                key={b.id}
                block={b}
                subject={data?.chapter.subject}
                focused={focusBlock === b.id}
                onPyq={(ids) => openPractice(ids, b.id)}
              />
            ))}
          </div>
        </div>
      )}
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
  focused,
  onPyq,
}: {
  block: BookBlock;
  subject?: string;
  focused?: boolean;
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
        ? "mt-9 text-2xl font-bold sm:text-3xl"
        : level === 2
          ? "mt-8 text-xl font-bold sm:text-2xl"
          : level === 3
            ? "mt-6 text-lg font-semibold"
            : "mt-5 text-base font-semibold";
    return (
      <h2 className={`paper-display ${cls} whitespace-pre-line tracking-tight`}>
        {cleanText(block.text ?? "")}
      </h2>
    );
  }

  if (block.type === "image") {
    return (
      <Figure src={resolveBookImage(block.image_url, subject)} caption={block.text ?? undefined} />
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
    <div
      id={`blk-${block.id}`}
      onClick={open}
      className={
        (hasPyq ? "cursor-pointer " : "") +
        "scroll-mt-24 p-1 transition " +
        (focused ? "rounded-xl ring-2 ring-amber-400" : "")
      }
    >
      {hasPyq && (
        <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Practise {pyqIds.length} PYQ{pyqIds.length > 1 ? "s" : ""} from this line
        </span>
      )}
      {hasText && (
        <p className="whitespace-pre-line text-[15px] leading-[1.9] sm:text-[17px]">
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
          Tap the highlighted line to solve the questions asked from it
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
        className="w-full max-w-full overflow-hidden rounded-xl border border-[color:var(--paper-rule)] bg-white shadow-sm"
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
        <figcaption className="paper-muted mt-2 px-3 text-center text-xs italic">
          {cleanText(caption)}
        </figcaption>
      )}
    </figure>
  );
}
