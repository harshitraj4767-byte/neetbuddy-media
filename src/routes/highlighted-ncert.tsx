import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState, useMemo } from "react";
import {
  fetchNcert, classKey, diagramsFor, metaFor, parseMarkdownTable,
  type ContentItem, type NcertChapter, type ParagraphItem, type HeadingItem,
  type ImageItem, type TableItem, type CaptionItem,
} from "@/ncert-explorer/ncert";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, BookOpen } from "lucide-react";

const ncertQuery = queryOptions({
  queryKey: ["ncert-explorer"],
  queryFn: fetchNcert,
  staleTime: 1000 * 60 * 60,
});

export const Route = createFileRoute("/highlighted-ncert")({
  head: () => ({ meta: [
    { title: "Highlighted NCERT — Neet Buddy" },
    { name: "description", content: "NCERT Biology chapters with PYQ-highlighted lines and diagrams." },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ncertQuery),
  component: Page,
  errorComponent: ({ error }) => (
    <Shell>
      <div className="py-10 text-center text-sm text-muted-foreground">Failed to load NCERT data. {error.message}</div>
    </Shell>
  ),
  pendingComponent: () => (
    <Shell><div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
    </div>
  );
}

function Page() {
  return (
    <Shell>
      <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <Inner />
      </Suspense>
    </Shell>
  );
}

function Inner() {
  const { data } = useSuspenseQuery(ncertQuery);
  const [active, setActive] = useState<{ cls: "11" | "12"; num: number } | null>(null);

  if (active) {
    const ch = data.chapters.find((c) => classKey(c.class) === active.cls && c.chapter_number === active.num);
    if (!ch) return <div className="py-10 text-center text-sm text-muted-foreground">Chapter not found.</div>;
    return <ChapterView chapter={ch} onBack={() => setActive(null)} />;
  }

  const class11 = data.chapters.filter((c) => classKey(c.class) === "11");
  const class12 = data.chapters.filter((c) => classKey(c.class) === "12");

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3 text-white shadow-lg">
          <BookOpen className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold sm:text-3xl">Highlighted NCERT</h1>
          <p className="text-sm text-muted-foreground">Class 11 & 12 Biology with PYQ-coloured lines and diagrams.</p>
        </div>
      </div>

      <Tabs defaultValue="11" className="w-full">
        <TabsList className="mb-4 grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="11">Class 11 · {class11.length}</TabsTrigger>
          <TabsTrigger value="12">Class 12 · {class12.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="11"><ChapterGrid chapters={class11} cls="11" onPick={(num) => setActive({ cls: "11", num })} /></TabsContent>
        <TabsContent value="12"><ChapterGrid chapters={class12} cls="12" onPick={(num) => setActive({ cls: "12", num })} /></TabsContent>
      </Tabs>
    </>
  );
}

function ChapterGrid({ chapters, cls, onPick }: { chapters: NcertChapter[]; cls: "11" | "12"; onPick: (num: number) => void }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {chapters.map((c) => {
        const imgs = diagramsFor(c.class, c.chapter_number).length;
        const meta = metaFor(c.class, c.chapter_number);
        return (
          <li key={`${cls}-${c.chapter_number}`}>
            <button
              onClick={() => onPick(c.chapter_number)}
              className="group relative block h-full w-full overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-elegant"
            >
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-primary-glow opacity-70" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Chapter {c.chapter_number}</div>
                  <div className="mt-1 text-base font-semibold group-hover:text-primary">{c.chapter_name}</div>
                </div>
                <div className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">{imgs} fig</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5 text-[10px]">
                {meta.important && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-400/20 to-orange-400/20 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">★ Important</span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">~{meta.expected_2027} Qs · NEET 2027</span>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {c.total_paragraphs ?? 0} paragraphs{c.total_pyqs ? ` · ${c.total_pyqs} PYQs` : ""}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function flatten(chapter: NcertChapter): ContentItem[] {
  const out: ContentItem[] = [];
  for (const p of chapter.pages ?? []) for (const c of p.content ?? []) out.push(c);
  return out;
}

function ChapterView({ chapter, onBack }: { chapter: NcertChapter; onBack: () => void }) {
  const diagrams = diagramsFor(chapter.class, chapter.chapter_number);
  const items = useMemo(() => flatten(chapter), [chapter]);

  const imageIdxs = items.map((it, i) => (it.type === "image" ? i : -1)).filter((i) => i >= 0);
  const headingIdxs = items.map((it, i) => (it.type === "heading" ? i : -1)).filter((i) => i >= 0);
  const insertAt = new Map<number, string[]>();
  const anchors = imageIdxs.length >= diagrams.length && imageIdxs.length > 0
    ? imageIdxs : headingIdxs.length > 0 ? headingIdxs : items.map((_, i) => i);
  diagrams.forEach((url, di) => {
    const pos = Math.min(anchors.length - 1, Math.round((di * (anchors.length - 1)) / Math.max(1, diagrams.length - 1)));
    const idx = anchors[pos];
    const arr = insertAt.get(idx) ?? [];
    arr.push(url);
    insertAt.set(idx, arr);
  });

  const stats = {
    paragraphs: items.filter((i) => i.type === "paragraph").length,
    pyqs: items.filter((i) => i.type === "paragraph" && (i as ParagraphItem).has_pyq).length,
    predicted: items.filter((i) => i.type === "paragraph" && (i as ParagraphItem).predicted).length,
    tables: items.filter((i) => i.type === "table").length,
  };

  return (
    <article>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3"><ArrowLeft className="mr-1 h-4 w-4" /> All chapters</Button>
      <header className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{chapter.class} · Chapter {chapter.chapter_number}</div>
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{chapter.chapter_name}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Pill>{stats.paragraphs} paragraphs</Pill>
          <Pill tone="orange">{stats.pyqs} PYQ lines</Pill>
          <Pill tone="green">{stats.predicted} predicted</Pill>
          <Pill tone="blue">{stats.tables} tables</Pill>
          <Pill tone="violet">{diagrams.length} diagrams</Pill>
        </div>
      </header>

      <Legend />

      <div className="mt-8 space-y-5">
        {items.map((it, i) => <RenderItem key={i} item={it} diagramsAfter={insertAt.get(i)} />)}
        {diagrams.length > 0 && anchors.length === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">{diagrams.map((u) => <Figure key={u} url={u} />)}</div>
        )}
      </div>
    </article>
  );
}

function Pill({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "orange" | "green" | "blue" | "violet" }) {
  const cls =
    tone === "orange" ? "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-500/30"
    : tone === "green" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
    : tone === "blue" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30"
    : tone === "violet" ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/30"
    : "bg-primary/10 text-primary ring-primary/30";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset ${cls}`}>{children}</span>;
}

function Legend() {
  const items = [
    { cls: "hl-orange", label: "PYQ line", desc: "Asked in a previous NEET paper" },
    { cls: "hl-green", label: "Expected PYQ", desc: "Predicted for the upcoming exam" },
    { cls: "hl-yellow", label: "Important", desc: "Key NCERT line · must-know" },
  ];
  return (
    <section className="mt-5 rounded-xl border bg-card/70 p-4 backdrop-blur">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Highlight guide</div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <li key={it.label} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 inline-block h-4 w-6 flex-none rounded ${it.cls}`} />
            <span><span className="font-semibold text-foreground">{it.label}</span><span className="block text-muted-foreground">{it.desc}</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RenderItem({ item, diagramsAfter }: { item: ContentItem; diagramsAfter?: string[] }) {
  const after = diagramsAfter && diagramsAfter.length > 0 ? (
    <div className="my-5 grid gap-4">{diagramsAfter.map((u) => <Figure key={u} url={u} />)}</div>
  ) : null;

  if (item.type === "heading") {
    const level = Math.min(4, Math.max(1, (item as HeadingItem).level ?? 2));
    const text = (item as HeadingItem).text ?? "";
    const cls = level === 1 ? "text-2xl font-bold text-primary mt-8"
      : level === 2 ? "text-xl font-semibold text-primary mt-6"
      : level === 3 ? "text-lg font-semibold mt-5" : "text-base font-semibold mt-4";
    return <><h2 className={`${cls} whitespace-pre-line`}>{text}</h2>{after}</>;
  }

  if (item.type === "paragraph") {
    const p = item as ParagraphItem;
    const isPyq = !!p.has_pyq;
    const isPredicted = !!p.predicted;
    const wrapperCls = isPyq
      ? "border-l-4 border-orange-400 bg-orange-500/5 pl-4 py-2 rounded-r-md"
      : isPredicted ? "border-l-4 border-emerald-400 bg-emerald-500/5 pl-4 py-2 rounded-r-md" : "";
    return (
      <>
        <div className={wrapperCls}>
          {isPyq && <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">PYQ × {p.pyq_count ?? 1}</div>}
          {isPredicted && !isPyq && p.prediction && (
            <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              {p.prediction.badge ?? "Expected"}
              {typeof p.prediction.confidence === "number" && <span className="font-normal opacity-70">· {p.prediction.confidence}%</span>}
            </div>
          )}
          <p className="text-[15px] leading-relaxed"><HighlightedParagraph text={p.text} pyq={isPyq} predicted={isPredicted} /></p>
          {isPredicted && p.prediction?.reason && <p className="mt-1 text-xs italic text-emerald-700/80 dark:text-emerald-300/80">Why expected: {p.prediction.reason}</p>}
        </div>
        {after}
      </>
    );
  }

  if (item.type === "table") return <><RenderTable text={(item as TableItem).text} />{after}</>;

  if (item.type === "image") {
    const im = item as ImageItem;
    return (
      <>
        <figure className="my-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
          <div className="font-semibold text-primary">Figure reference</div>
          {im.description && <div className="mt-1">{im.description}</div>}
          {im.caption && <div className="mt-1 italic">{im.caption}</div>}
        </figure>
        {after}
      </>
    );
  }
  if (item.type === "caption") return <><p className="text-center text-xs italic text-muted-foreground">{(item as CaptionItem).text}</p>{after}</>;

  const text = (item as { text?: unknown }).text;
  if (typeof text === "string") return <><p className="text-[15px] leading-relaxed text-muted-foreground">{text}</p>{after}</>;
  return <>{after}</>;
}

function HighlightedParagraph({ text, pyq, predicted }: { text: string; pyq: boolean; predicted: boolean }) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)?.map((s) => s.trim()) ?? [text];
  const cueRe = /\b(is defined as|are defined as|is called|are called|refers to|known as|consists of|composed of|made up of|essential|only|always|never|first|main|primary|the largest|the smallest)\b/i;
  let keyIdx = sentences.findIndex((s) => cueRe.test(s));
  if (keyIdx < 0 && !pyq && !predicted) keyIdx = -1;
  return (
    <>
      {sentences.map((s, i) => {
        const sep = i < sentences.length - 1 ? " " : "";
        if (i === keyIdx) return <span key={i}><span className="hl-yellow">{s}</span>{sep}</span>;
        return <span key={i}>{s}{sep}</span>;
      })}
    </>
  );
}

function RenderTable({ text }: { text: string }) {
  const t = parseMarkdownTable(text);
  if (!t) return <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">{text}</pre>;
  return (
    <figure className="my-5 overflow-hidden rounded-xl border shadow-sm">
      {t.title && <figcaption className="bg-gradient-to-r from-primary to-primary-glow px-4 py-2 text-sm font-semibold text-primary-foreground">{t.title}</figcaption>}
      <div className="overflow-x-auto bg-card">
        <table className="w-full border-collapse text-sm">
          <thead><tr className="bg-primary/10">{t.headers.map((h, i) => <th key={i} className="border-b px-3 py-2 text-left font-semibold text-primary">{h}</th>)}</tr></thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri} className={ri % 2 ? "bg-primary/5" : ""}>
                {r.map((c, ci) => <td key={ci} className="border-b px-3 py-2 align-top">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Figure({ url }: { url: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <img src={url} alt="NCERT diagram" loading="lazy" className="block w-full" />
    </figure>
  );
}
