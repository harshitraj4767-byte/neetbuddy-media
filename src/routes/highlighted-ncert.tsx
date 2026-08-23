import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState, useMemo, useEffect } from "react";
import {
  fetchNcert, classKey, diagramsFor, metaFor, parseMarkdownTable,
  type ContentItem, type NcertChapter, type ParagraphItem, type HeadingItem,
  type ImageItem, type TableItem, type CaptionItem,
} from "@/ncert-explorer/ncert";
import { SiteHeader } from "@/components/site-header";
import { Loader2, ChevronLeft, ChevronRight, BookOpen, AlignLeft, ImageIcon, Languages, Map, Sparkles, X } from "lucide-react";

const ncertQuery = queryOptions({
  queryKey: ["ncert-explorer"],
  queryFn: fetchNcert,
  staleTime: 1000 * 60 * 60,
});

/* ------------------------------------------------------------------ */
/* Image path convention                                               */
/* public/ncert/<subject>/images/<Chapter_Name>-image<N>.png           */
/* e.g. public/ncert/biology/images/Anatomy_of_Flowering_Plants-image13.png */
/* ------------------------------------------------------------------ */
export function chapterSlug(name: string): string {
  return name
    .replace(/[:,]/g, "")
    .replace(/&/g, "and")
    .trim()
    .replace(/\s+/g, "_");
}

export function ncertImageSrc(subject: string, chapterName: string, file?: string, index?: number): string {
  const base = `/ncert/${subject.toLowerCase()}/images`;
  if (file) {
    if (/^https?:\/\//.test(file) || file.startsWith("/")) return file;
    return `${base}/${file}`;
  }
  return `${base}/${chapterSlug(chapterName)}-image${index ?? 1}.png`;
}

type Subject = "biology" | "chemistry" | "physics";
const SUBJECTS: { id: Subject; label: string }[] = [
  { id: "biology", label: "Biology" },
  { id: "chemistry", label: "Chemistry" },
  { id: "physics", label: "Physics" },
];

export const Route = createFileRoute("/highlighted-ncert")({
  head: () => ({
    meta: [
      { title: "Highlighted NCERT E-Book — Neet Buddy" },
      { name: "description", content: "Read NCERT chapters with PYQ-highlighted lines, diagrams and related previous year questions." },
      { property: "og:title", content: "Highlighted NCERT E-Book — Neet Buddy" },
      { property: "og:description", content: "NCERT chapters with PYQ-highlighted lines, diagrams and related PYQs." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ncertQuery),
  component: Page,
  errorComponent: ({ error }) => (
    <Shell>
      <div className="py-10 text-center text-sm text-muted-foreground">Failed to load NCERT data. {error.message}</div>
    </Shell>
  ),
  pendingComponent: () => (
    <Shell><Spinner /></Shell>
  ),
});

function Spinner() {
  return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
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
  return (
    <Shell>
      <Suspense fallback={<Spinner />}>
        <Inner />
      </Suspense>
    </Shell>
  );
}

function Inner() {
  const { data } = useSuspenseQuery(ncertQuery);
  const [subject, setSubject] = useState<Subject>("biology");
  const [active, setActive] = useState<{ cls: "11" | "12"; num: number } | null>(null);

  useEffect(() => { if (active) window.scrollTo({ top: 0 }); }, [active]);

  const chapters = useMemo(
    () => [...(data.chapters ?? [])].sort((a, b) => a.chapter_name.localeCompare(b.chapter_name)),
    [data],
  );

  if (active) {
    const ch = chapters.find((c) => classKey(c.class) === active.cls && c.chapter_number === active.num);
    if (!ch) return <div className="py-10 text-center text-sm text-muted-foreground">Chapter not found.</div>;
    return <Reader chapter={ch} subject={subject} onBack={() => setActive(null)} />;
  }

  return (
    <>
      <BookHeader />
      <SubjectTabs value={subject} onChange={setSubject} />
      {subject === "biology" ? (
        <ChapterList chapters={chapters} onPick={(c) => setActive({ cls: classKey(c.class), num: c.chapter_number })} />
      ) : (
        <EmptySubject label={SUBJECTS.find((s) => s.id === subject)!.label} />
      )}
    </>
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Medical Preparation</p>
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
            <SubjectIcon id={s.id} />
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SubjectIcon({ id }: { id: Subject }) {
  const cls = "h-4 w-4";
  if (id === "chemistry") return <span className={cls}>⚗️</span>;
  if (id === "physics") return <span className={cls}>⚛️</span>;
  return <span className={cls}>🧬</span>;
}

function EmptySubject({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center">
      <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
      <div className="text-sm font-semibold">{label} e-book coming soon</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload chapter images to <code className="rounded bg-muted px-1">public/ncert/{label.toLowerCase()}/images/</code> to get started.
      </p>
    </div>
  );
}

/* --------------------------- chapter list -------------------------- */

function ChapterList({ chapters, onPick }: { chapters: NcertChapter[]; onPick: (c: NcertChapter) => void }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Chapters</div>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{chapters.length}</span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {chapters.map((c) => {
          const paras = c.total_paragraphs ?? countType(c, "paragraph");
          const imgs = c.total_images ?? Math.max(countType(c, "image"), diagramsFor(c.class, c.chapter_number).length);
          const meta = metaFor(c.class, c.chapter_number);
          return (
            <li key={`${c.class}-${c.chapter_number}`}>
              <button
                onClick={() => onPick(c)}
                className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-elegant"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {c.chapter_number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{c.chapter_name}</span>
                    {meta.important && <span className="shrink-0 text-amber-500">★</span>}
                  </span>
                  <span className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><AlignLeft className="h-3.5 w-3.5" />{paras}</span>
                    <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{imgs}</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-emerald-500" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function countType(c: NcertChapter, t: string) {
  let n = 0;
  for (const p of c.pages ?? []) for (const it of p.content ?? []) if (it.type === t) n++;
  return n;
}

/* ------------------------------ reader ----------------------------- */

function flatten(chapter: NcertChapter): ContentItem[] {
  const out: ContentItem[] = [];
  for (const p of chapter.pages ?? []) for (const c of p.content ?? []) out.push(c);
  return out;
}

function Reader({ chapter, subject, onBack }: { chapter: NcertChapter; subject: Subject; onBack: () => void }) {
  const items = useMemo(() => flatten(chapter), [chapter]);
  const fallbackDiagrams = diagramsFor(chapter.class, chapter.chapter_number);
  const [pyqFor, setPyqFor] = useState<ParagraphItem | null>(null);
  const [showFigures, setShowFigures] = useState(false);

  let imageCounter = 0;

  return (
    <article>
      {/* sticky chapter bar */}
      <div className="sticky top-0 z-20 -mx-3 mb-4 flex items-center gap-2 border-b bg-background/85 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <button onClick={onBack} className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground" aria-label="Back to chapters">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{chapter.chapter_name}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{chapter.class} · Chapter {chapter.chapter_number}</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <Languages className="h-3.5 w-3.5" /> EN
        </span>
        <button
          onClick={() => setShowFigures((v) => !v)}
          className={"rounded-full p-1.5 transition " + (showFigures ? "bg-primary/10 text-primary" : "text-primary/70 hover:bg-secondary")}
          aria-label="Toggle figures"
        >
          <Map className="h-5 w-5" />
        </button>
      </div>

      <Legend />

      {showFigures && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fallbackDiagrams.map((u) => <Figure key={u} src={u} />)}
          {fallbackDiagrams.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
              No figures indexed for this chapter yet.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {items.map((it, i) => {
          if (it.type === "image") imageCounter += 1;
          return (
            <RenderItem
              key={i}
              item={it}
              chapter={chapter}
              subject={subject}
              imageIndex={imageCounter}
              onPyq={setPyqFor}
            />
          );
        })}
      </div>

      {pyqFor && <RelatedPyqSheet item={pyqFor} onClose={() => setPyqFor(null)} />}
    </article>
  );
}

function Legend() {
  const items = [
    { cls: "bg-yellow-300/70 dark:bg-yellow-400/40", label: "Highlighted line" },
    { cls: "bg-orange-400/60 dark:bg-orange-400/40", label: "Asked in PYQ" },
    { cls: "bg-emerald-400/50 dark:bg-emerald-400/35", label: "Expected next" },
  ];
  return (
    <section className="rounded-xl border bg-card/70 px-4 py-3 backdrop-blur">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-block h-3 w-6 rounded ${it.cls}`} />
            {it.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RenderItem({
  item, chapter, subject, imageIndex, onPyq,
}: {
  item: ContentItem;
  chapter: NcertChapter;
  subject: Subject;
  imageIndex: number;
  onPyq: (p: ParagraphItem) => void;
}) {
  if (item.type === "heading") {
    const h = item as HeadingItem;
    const level = Math.min(4, Math.max(1, h.level ?? 2));
    const cls =
      level === 1 ? "mt-9 text-2xl font-extrabold"
      : level === 2 ? "mt-8 text-xl font-bold"
      : level === 3 ? "mt-6 text-lg font-bold" : "mt-5 text-base font-semibold";
    return <h2 className={`${cls} whitespace-pre-line tracking-tight`}>{h.text}</h2>;
  }

  if (item.type === "paragraph") {
    const p = item as ParagraphItem;
    const isPyq = !!p.has_pyq;
    const isPredicted = !!p.predicted;
    const accent = isPyq
      ? "border-l-4 border-blue-500 pl-4"
      : isPredicted ? "border-l-4 border-emerald-500 pl-4" : "";
    return (
      <div className={accent}>
        {(isPyq || isPredicted) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {isPyq && (
              <button
                onClick={() => onPyq(p)}
                className="inline-flex items-center gap-1 rounded-full bg-blue-500/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-300"
              >
                Related PYQs · {p.pyq_count ?? 1}
              </button>
            )}
            {isPredicted && !isPyq && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                {p.prediction?.badge ?? "Expected"}
                {typeof p.prediction?.confidence === "number" && <span className="font-medium opacity-70">· {p.prediction.confidence}%</span>}
              </span>
            )}
          </div>
        )}
        <p className="text-justify text-[15px] leading-[1.9] sm:text-base">
          <HighlightedText text={p.text} pyq={isPyq} predicted={isPredicted} />
        </p>
        {isPredicted && p.prediction?.reason && (
          <p className="mt-1 text-xs italic text-emerald-700/80 dark:text-emerald-300/80">Why expected: {p.prediction.reason}</p>
        )}
      </div>
    );
  }

  if (item.type === "table") return <RenderTable text={(item as TableItem).text} />;

  if (item.type === "image") {
    const im = item as ImageItem;
    return (
      <Figure
        src={ncertImageSrc(subject, chapter.chapter_name, im.file, imageIndex)}
        caption={im.caption ?? im.description}
      />
    );
  }

  if (item.type === "caption") {
    return <p className="text-center text-xs italic text-muted-foreground">{(item as CaptionItem).text}</p>;
  }

  const text = (item as { text?: unknown }).text;
  if (typeof text === "string") return <p className="text-[15px] leading-[1.9] text-muted-foreground">{text}</p>;
  return null;
}

/** Marker-pen highlighting of the key sentences inside a paragraph. */
function HighlightedText({ text, pyq, predicted }: { text: string; pyq: boolean; predicted: boolean }) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)?.map((s) => s.trim()) ?? [text];
  const cueRe = /\b(is defined as|are defined as|is called|are called|is termed|are termed|refers to|known as|consists of|composed of|made up of|essential|only|always|never|first|main|primary|largest|smallest|e\.g\.)\b/i;
  const tone = pyq
    ? "bg-orange-300/60 decoration-orange-500 dark:bg-orange-400/30"
    : predicted
      ? "bg-emerald-300/50 dark:bg-emerald-400/25"
      : "bg-yellow-300/70 dark:bg-yellow-400/30";
  return (
    <>
      {sentences.map((s, i) => {
        const sep = i < sentences.length - 1 ? " " : "";
        const hit = cueRe.test(s) || ((pyq || predicted) && i === 0);
        if (hit) {
          return (
            <span key={i}>
              <mark className={`rounded-sm bg-none px-0.5 text-foreground ${tone}`}>{s}</mark>
              {sep}
            </span>
          );
        }
        return <span key={i}>{s}{sep}</span>;
      })}
    </>
  );
}

function RenderTable({ text }: { text: string }) {
  const t = parseMarkdownTable(text);
  if (!t) return <pre className="overflow-x-auto rounded-xl border bg-muted/40 p-3 text-xs">{text}</pre>;
  return (
    <figure className="my-5 overflow-hidden rounded-2xl border shadow-soft">
      {t.title && (
        <figcaption className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white">{t.title}</figcaption>
      )}
      <div className="overflow-x-auto bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-emerald-500/10">
              {t.headers.map((h, i) => <th key={i} className="border-b px-3 py-2 text-left font-semibold text-emerald-700 dark:text-emerald-300">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? "bg-muted/40" : ""}>
                {r.map((c, ci) => <td key={ci} className="border-b px-3 py-2 align-top">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Figure({ src, caption }: { src: string; caption?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <figure className="my-4 rounded-2xl border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
        <ImageIcon className="mx-auto mb-1 h-5 w-5 opacity-60" />
        {caption ?? "Figure not uploaded yet"}
        <div className="mt-1 break-all font-mono text-[10px] opacity-60">{src}</div>
      </figure>
    );
  }
  return (
    <figure className="my-4 overflow-hidden rounded-2xl border bg-card shadow-soft">
      <img src={src} alt={caption ?? "NCERT diagram"} loading="lazy" onError={() => setFailed(true)} className="block w-full" />
      {caption && <figcaption className="border-t px-3 py-2 text-center text-xs italic text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

/* --------------------------- related PYQs --------------------------- */

function RelatedPyqSheet({ item, onClose }: { item: ParagraphItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-card p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Related PYQs</h3>
          <button onClick={onClose} className="rounded-full bg-secondary p-2 text-muted-foreground transition hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-4 text-sm leading-relaxed">
          {item.text}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {item.pyq_count ?? 1} previous-year question{(item.pyq_count ?? 1) > 1 ? "s" : ""} have been asked from this line.
        </p>
      </div>
    </div>
  );
}
