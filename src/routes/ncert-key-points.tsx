import { publicMediaAsset } from "@/lib/media-assets";
// NCERT Nuggets — paragraph-by-paragraph revision.
//
// Flow: subject → chapter → topic grid (nugget tiles) → mode sheet
//       (Experience / Revision / Analytics) → player.
// The player shows one NCERT paragraph on a paper page, then every question
// linked to that paragraph (PYQs + full question bank), then the next
// paragraph. Every response is stored so the analytics view can replay it.
import { MissionBanner } from "@/components/mission-banner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { HubHero } from "@/components/nav-tiles";
import { PyqRichText } from "@/components/pyq-rich-text";
import { NcertPyqImage } from "@/components/ncert-pyq-image";
import { useAuth } from "@/hooks/use-auth";
import { resolveBookImage, runImageSrc, listBookChapters, type BookChapter, type Run } from "@/lib/ncert-book";
import {
  getChapterKeyPoints,
  getChapterProgress,
  getChapterAnswers,
  getKeyPointChapterStats,
  saveKeyPointAnswer,
  saveKeyPointProgress,
  type ChapterKeyPoints,
  type KeyPointQuestion,
  type KeyPointTopic,
  type KeyPointPara,
  type KeyPointAnswer,
} from "@/lib/ncert-keypoints";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Check,
  X,
  BarChart3,
  Sparkles,
  RotateCcw,
  Search,
  GraduationCap,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type Subject = "biology" | "chemistry" | "physics";
const SUBJECTS: { id: Subject; label: string; icon: string }[] = [
  { id: "biology", label: "Biology", icon: "🧬" },
  { id: "chemistry", label: "Chemistry", icon: "⚗️" },
  { id: "physics", label: "Physics", icon: "⚛️" },
];

type Mode = "experience" | "revision" | "analytics";

export const Route = createFileRoute("/ncert-key-points")({
  head: () => ({
    meta: [
      { title: "NCERT Nuggets — Neet Buddy" },
      {
        name: "description",
        content:
          "Revise NCERT one key paragraph at a time, then answer every question asked from that line — with your responses saved for analytics.",
      },
      { property: "og:title", content: "NCERT Nuggets — Neet Buddy" },
      {
        property: "og:description",
        content:
          "Paragraph-wise NCERT revision with all related questions and saved performance analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    subject: typeof search.subject === "string" ? (search.subject as Subject) : undefined,
    slug: typeof search.slug === "string" ? search.slug : undefined,
    topic: typeof search.topic === "string" ? search.topic : undefined,
    mode: typeof search.mode === "string" ? (search.mode as Mode) : undefined,
  }),
  component: Page,
  errorComponent: ({ error }) => (
    <Shell>
      <ErrorBox message={error.message} />
    </Shell>
  ),
});

/* ------------------------------- shell -------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/40">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-3 pb-44 pt-4 sm:px-4">
        <MissionBanner />
        {children}
      </main>
    </div>
  );
}

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label}
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <div className="text-sm font-semibold text-destructive">Couldn't load nuggets</div>
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

/* -------------------------------- page -------------------------------- */

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/ncert-key-points" });
  const subject: Subject = search.subject ?? "biology";
  const { user } = useAuth();

  const chaptersQ = useQuery({
    queryKey: ["keypoints", "chapters"],
    queryFn: () => listBookChapters(),
    staleTime: 1000 * 60 * 30,
  });

  const statsQ = useQuery({
    queryKey: ["keypoints", "stats", user?.id ?? "guest"],
    queryFn: () => getKeyPointChapterStats(user!.id),
    enabled: !!user?.id,
    staleTime: 1000 * 20,
  });

  const go = (next: Partial<typeof search>) =>
    navigate({ search: { ...search, ...next } as never });

  if (search.slug) {
    return (
      <Shell>
        <ChapterView
          slug={search.slug}
          topicKey={search.topic}
          mode={search.mode}
          onBack={() => go({ slug: undefined, topic: undefined, mode: undefined })}
          onOpenTopic={(topic, mode) => go({ topic, mode })}
          onCloseTopic={() => go({ topic: undefined, mode: undefined })}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <HubHero
        eyebrow="NCERT + every question"
        title="NCERT Nuggets"
        description="Read one NCERT key paragraph, then solve every question ever asked from it. Your answers are saved, so you can review or revise any topic later."
        Icon={GraduationCap}
        accent="blue"
        variant="banner"
        compact
        image={publicMediaAsset("illustrations/i3d-ncert-highlights.png")}
        imageAlt="NCERT nuggets illustration"
      />

      <div className="mb-5 grid grid-cols-3 gap-2">
        {SUBJECTS.map((s) => {
          const on = s.id === subject;
          return (
            <button
              key={s.id}
              onClick={() => navigate({ search: { subject: s.id } as never })}
              className={
                "flex items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-semibold transition " +
                (on
                  ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/70")
              }
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {chaptersQ.isPending && <Spinner label="Loading chapters" />}
      {chaptersQ.isError && (
        <ErrorBox message={(chaptersQ.error as Error).message} onRetry={() => chaptersQ.refetch()} />
      )}
      {chaptersQ.data && (
        <ChapterList
          chapters={chaptersQ.data.filter((c) => c.subject === subject)}
          stats={statsQ.data ?? {}}
          onPick={(slug) => go({ slug })}
        />
      )}
    </Shell>
  );
}

/* ---------------------------- chapter list ---------------------------- */

function ChapterList({
  chapters,
  stats,
  onPick,
}: {
  chapters: BookChapter[];
  stats: Record<string, { attempted: number; correct: number }>;
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
        No chapters published for this subject yet.
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
            className="w-full rounded-full border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500/60"
          />
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {filtered.length}
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((c, i) => {
          const st = stats[c.slug];
          return (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.slug)}
                className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-sky-500/50 hover:shadow-elegant"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-sm font-bold text-sky-600 dark:text-sky-400">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold group-hover:text-sky-600 dark:group-hover:text-sky-400">
                    {c.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {c.para_count} nuggets
                    {st ? ` · ${st.attempted} answered · ${st.correct} correct` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-sky-500" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------- chapter view ---------------------------- */

function ChapterView({
  slug,
  topicKey,
  mode,
  onBack,
  onOpenTopic,
  onCloseTopic,
}: {
  slug: string;
  topicKey?: string;
  mode?: Mode;
  onBack: () => void;
  onOpenTopic: (topic: string, mode: Mode) => void;
  onCloseTopic: () => void;
}) {
  const { user } = useAuth();
  const dataQ = useQuery({
    queryKey: ["keypoints", "chapter", slug],
    queryFn: () => getChapterKeyPoints(slug),
    staleTime: 1000 * 60 * 30,
  });
  const progressQ = useQuery({
    queryKey: ["keypoints", "progress", slug, user?.id ?? "guest"],
    queryFn: () => getChapterProgress(user!.id, slug),
    enabled: !!user?.id,
    staleTime: 1000 * 10,
  });
  const answersQ = useQuery({
    queryKey: ["keypoints", "answers", slug, user?.id ?? "guest"],
    queryFn: () => getChapterAnswers(user!.id, slug),
    enabled: !!user?.id,
    staleTime: 1000 * 10,
  });

  const [sheetTopic, setSheetTopic] = useState<KeyPointTopic | null>(null);

  if (dataQ.isPending) return <Spinner label="Building NCERT Nuggets" />;
  if (dataQ.isError)
    return <ErrorBox message={(dataQ.error as Error).message} onRetry={() => dataQ.refetch()} />;

  const data = dataQ.data as ChapterKeyPoints;
  const progress = progressQ.data ?? {};
  const answers = answersQ.data ?? [];
  const topic = topicKey ? data.topics.find((t) => t.key === topicKey) : undefined;

  if (topic && mode === "analytics") {
    return (
      <TopicAnalytics
        chapter={data}
        topic={topic}
        answers={answers.filter((a) => a.topic_key === topic.key)}
        onBack={onCloseTopic}
        onRevise={() => onOpenTopic(topic.key, "revision")}
      />
    );
  }

  if (topic && mode === "revision") {
    const ti = data.topics.findIndex((t) => t.key === topic.key);
    const nextTopic = ti >= 0 ? data.topics[ti + 1] : undefined;
    return (
      <RevisionModePlayer
        key={topic.key + mode}
        chapter={data}
        topic={topic}
        onExit={onCloseTopic}
        onAnalytics={() => onOpenTopic(topic.key, "analytics")}
        nextTopicTitle={nextTopic?.title ?? null}
        onNextTopic={nextTopic ? () => onOpenTopic(nextTopic.key, mode) : undefined}
      />
    );
  }

  if (topic && mode === "experience") {
    const ti = data.topics.findIndex((t) => t.key === topic.key);
    const nextTopic = ti >= 0 ? data.topics[ti + 1] : undefined;
    return (
      <TopicPlayer
        key={topic.key + mode}
        chapter={data}
        topic={topic}
        mode={mode}
        startIndex={progress[topic.key]?.step_index ?? 0}
        pastAnswers={answers.filter((a) => a.topic_key === topic.key)}
        onExit={onCloseTopic}
        onAnalytics={() => onOpenTopic(topic.key, "analytics")}
        nextTopicTitle={nextTopic?.title ?? null}
        onNextTopic={nextTopic ? () => onOpenTopic(nextTopic.key, mode) : undefined}
      />
    );
  }


  return (
    <>
      <div className="sticky top-0 z-20 -mx-3 mb-4 flex items-center gap-2 border-b bg-background/85 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <button
          onClick={onBack}
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Back to chapters"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{data.chapter.title}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {data.topics.length} topics · {data.questionTotal} questions
          </div>
        </div>
      </div>

      <TopicGrid
        topics={data.topics}
        progress={progress}
        answers={answers}
        onPick={(t) => setSheetTopic(t)}
      />

      {sheetTopic && (
        <ModeSheet
          topic={sheetTopic}
          resumeAt={progress[sheetTopic.key]?.step_index ?? 0}
          onClose={() => setSheetTopic(null)}
          onPick={(m) => {
            const key = sheetTopic.key;
            setSheetTopic(null);
            onOpenTopic(key, m);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------ topic grid ---------------------------- */

function TopicGrid({
  topics,
  progress,
  answers,
  onPick,
}: {
  topics: KeyPointTopic[];
  progress: Record<string, { step_index: number; steps_total: number; completed: boolean }>;
  answers: KeyPointAnswer[];
  onPick: (t: KeyPointTopic) => void;
}) {
  const answeredByTopic = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const a of answers) {
      const set = m.get(a.topic_key) ?? new Set<string>();
      set.add(`${a.source}:${a.question_id}`);
      m.set(a.topic_key, set);
    }
    return m;
  }, [answers]);

  return (
    <div className="space-y-4">
      {topics.map((t) => {
        const p = progress[t.key];
        const started = (p?.step_index ?? 0) > 0;
        const locked = false; // every topic is open — jump anywhere, any time
        const done = p?.completed ?? false;
        const answered = answeredByTopic.get(t.key)?.size ?? 0;
        const pct = t.steps.length
          ? Math.round((Math.min(p?.step_index ?? 0, t.steps.length) / t.steps.length) * 100)
          : 0;


        return (
          <section
            key={t.key}
            className={
              "rounded-2xl border bg-card p-4 shadow-soft transition " +
              (locked ? "opacity-60" : "hover:border-sky-500/40")
            }
          >
            <button
              disabled={locked}
              onClick={() => onPick(t)}
              className="flex w-full items-center gap-3 text-left disabled:cursor-not-allowed"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-xs font-bold text-sky-600 dark:text-sky-400">
                {locked ? <Lock className="h-4 w-4" /> : t.key === "intro" ? "★" : t.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{t.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t.paraCount} nuggets · {t.questionCount} questions · {answered} answered
                </span>
                <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <span
                    className={
                      "block h-full rounded-full transition-all " +
                      (done
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                        : "bg-gradient-to-r from-sky-500 to-indigo-500")
                    }
                    style={{ width: `${Math.max(pct, started ? 5 : 0)}%` }}
                  />
                </span>
              </span>
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              )}
            </button>

            {/* nugget tiles: one per key point inside the topic, single horizontal slider */}
            <div className="mt-3 -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {t.paras
                .filter((p2) => p2.kind === "paragraph")
                .map((p2, i) => {
                  const stepIdx = t.steps.findIndex(
                    (s) => s.kind === "para" && s.para.blockId === p2.blockId,
                  );
                  const reached = (p?.step_index ?? 0) >= stepIdx;
                  return (
                    <div
                      key={p2.blockId}
                      title={p2.text.slice(0, 80)}
                      className={
                        "flex h-11 w-11 shrink-0 snap-start items-center justify-center rounded-xl border text-[11px] font-bold " +
                        (reached
                          ? "border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : "border-dashed bg-secondary/60 text-muted-foreground")
                      }
                    >
                      {String(i + 1).padStart(2, "0")}
                    </div>
                  );

                })}
            </div>

          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------ mode sheet ---------------------------- */

function ModeSheet({
  topic,
  resumeAt,
  onClose,
  onPick,
}: {
  topic: KeyPointTopic;
  resumeAt: number;
  onClose: () => void;
  onPick: (m: Mode) => void;
}) {
  const options: { id: Mode; label: string; desc: string; Icon: typeof Sparkles }[] = [
    {
      id: "experience",
      label: resumeAt > 0 ? "Continue revision" : "Experience Mode",
      desc: "Paragraph → its questions → next paragraph, saved as you go.",
      Icon: Sparkles,
    },
    {
      id: "revision",
      label: "Revision Mode",
      desc: "Start this topic again from the first key point.",
      Icon: RotateCcw,
    },
    {
      id: "analytics",
      label: "View Analytics",
      desc: "See every response you gave in this topic.",
      Icon: BarChart3,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-t-3xl border bg-card p-5 shadow-elegant sm:rounded-3xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
        <div className="text-sm font-bold">{topic.title}</div>
        <div className="text-xs text-muted-foreground">
          {topic.paraCount} nuggets · {topic.questionCount} questions
        </div>
        <div className="mt-4 space-y-2">
          {options.map((o) => (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              className="flex w-full items-center gap-3 rounded-2xl border bg-background p-3 text-left transition hover:border-sky-500/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
                <o.Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-secondary py-2.5 text-sm font-semibold text-muted-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- player ------------------------------ */

function TopicPlayer({
  chapter,
  topic,
  mode,
  startIndex,
  pastAnswers,
  onExit,
  onAnalytics,
  nextTopicTitle,
  onNextTopic,
}: {
  chapter: ChapterKeyPoints;
  topic: KeyPointTopic;
  mode: Mode;
  startIndex: number;
  pastAnswers: KeyPointAnswer[];
  onExit: () => void;
  onAnalytics: () => void;
  nextTopicTitle?: string | null;
  onNextTopic?: () => void;
}) {

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const total = topic.steps.length;
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(total - 1, 0)));
  const [picked, setPicked] = useState<Record<string, { selected: string | null; correct: boolean; skipped: boolean }>>(
    () => {
      const seed: Record<string, { selected: string | null; correct: boolean; skipped: boolean }> = {};
      if (mode !== "revision")
        for (const a of pastAnswers)
          seed[`${a.source}:${a.question_id}`] = {
            selected: a.selected,
            correct: a.is_correct,
            skipped: Boolean((a as any).skipped),
          };
      return seed;
    },
  );
  const [choice, setChoice] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const step = topic.steps[index];

  useEffect(() => {
    setChoice(null);
    startedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }, [index]);

  // Persist the furthest position reached.
  useEffect(() => {
    if (!user?.id) return;
    void saveKeyPointProgress({
      userId: user.id,
      chapterSlug: chapter.chapter.slug,
      topicKey: topic.key,
      stepIndex: index,
      stepsTotal: total,
      completed: index >= total - 1,
    });
  }, [index, total, user?.id, chapter.chapter.slug, topic.key]);

  const next = () => setIndex((i) => Math.min(i + 1, total - 1));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const submit = async (selected: string | null, skipped: boolean) => {
    if (!step || step.kind !== "question") return;
    const q = step.question;
    const correct = !skipped && !!q.correctKey && selected === q.correctKey;
    setPicked((m) => ({ ...m, [q.key]: { selected, correct, skipped } }));
    try {
      await saveKeyPointAnswer({
        userId: user?.id,
        chapterSlug: chapter.chapter.slug,
        topicKey: topic.key,
        blockId: step.para.blockId,
        question: q,
        selected,
        isCorrect: correct,
        skipped,
        timeMs: Date.now() - startedAt.current,
      });
      void queryClient.invalidateQueries({ queryKey: ["keypoints", "answers"] });
      void queryClient.invalidateQueries({ queryKey: ["keypoints", "stats"] });
    } catch {
      /* answers are best-effort; never block the flow */
    }
  };

  if (!step) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Nothing to revise in this topic yet.
        <div className="mt-4">
          <button onClick={onExit} className="rounded-full bg-secondary px-4 py-2 text-xs font-semibold">
            Back to topics
          </button>
        </div>
      </div>
    );
  }

  const atEnd = index >= total - 1;
  const pct = Math.round(((index + 1) / total) * 100);

  return (
    <div className="pb-32">
      <div className="sticky top-0 z-20 -mx-3 mb-4 border-b bg-background/85 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{topic.title}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {chapter.chapter.title} · {mode === "revision" ? "Revision" : "Experience"} mode
            </div>
          </div>
          <button
            onClick={onAnalytics}
            className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:text-foreground"
          >
            Analytics
          </button>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {step.kind === "para" ? (
        <PaperPage
          subject={chapter.chapter.subject}
          para={step.para}
          questionCount={step.para.questions.length}
        />
      ) : (
        <QuestionCard
          subject={chapter.chapter.subject}
          question={step.question}
          result={picked[step.question.key]}
          choice={choice}
          onChoose={setChoice}
          onSubmit={() => submit(choice, false)}
          onSkip={() => submit(null, true)}
        />
      )}

      {/* bottom bar: back / continue, exactly like a book page turn */}
      <div className="fixed inset-x-0 bottom-0 z-[60] border-t bg-background/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-4">
        <div className="mx-auto max-w-7xl">
          {atEnd && onNextTopic && (
            <button
              onClick={onNextTopic}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-500/25"
            >
              Next topic
              {nextTopicTitle ? (
                <span className="max-w-[45%] truncate font-semibold opacity-90">
                  · {nextTopicTitle}
                </span>
              ) : null}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={prev}
              disabled={index === 0}
              className="rounded-full border px-4 py-2.5 text-xs font-bold text-muted-foreground transition disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={atEnd ? onAnalytics : next}
              className={
                "flex-1 rounded-full py-3 text-sm font-bold transition " +
                (atEnd
                  ? "border bg-secondary text-foreground"
                  : "bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25")
              }
            >
              {atEnd ? "View analysis" : "Tap to continue"}
            </button>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {index + 1}/{total}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ------------------------------ paper page ---------------------------- */

/** A single NCERT key point rendered like a real book page. */
function ParaRuns({ runs, text, subject }: { runs: Run[]; text: string; subject: string }) {
  const usable = (runs ?? []).filter((r) => (r.t === "img" ? !!runImageSrc(r) : r.t === "br" || !!r.s));
  if (usable.length === 0) return <>{text}</>;
  return (
    <>
      {usable.map((r, i) => {
        if (r.t === "br") return <br key={i} />;
        if (r.t === "img")
          return (
            <img
              key={i}
              src={resolveBookImage(runImageSrc(r)) ?? ''}
              alt=""
              loading="lazy"
              className="mx-auto my-3 block max-h-[55vh] w-auto rounded-xl bg-white/60 p-2"
            />
          );
        if (r.t === "hl")
          return (
            <mark key={i} className="rounded bg-amber-300/60 px-0.5 text-amber-950">
              {r.s}
            </mark>
          );
        return <span key={i}>{r.s}</span>;
      })}
    </>
  );
}

function PaperPage({
  subject,
  para,
  questionCount,
}: {
  subject: string;
  para: KeyPointPara;
  questionCount: number;
}) {
  const { kind, text, runs, imageUrl, heading, headingRuns, figures } = para;
  return (
    <article
      className="relative overflow-hidden rounded-3xl border border-amber-900/15 p-5 shadow-elegant sm:p-8"
      style={{
        backgroundColor: "#fbf6e9",
        backgroundImage:
          "radial-gradient(circle at 20% 15%, rgba(180,140,80,0.10), transparent 45%), radial-gradient(circle at 85% 80%, rgba(150,120,70,0.10), transparent 40%), repeating-linear-gradient(0deg, rgba(120,90,50,0.05) 0px, rgba(120,90,50,0.05) 1px, transparent 1px, transparent 28px)",
      }}
    >
      <div className="mb-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-amber-900/50">
        <span>NCERT · {subject}</span>
        {questionCount > 0 && <span>{questionCount} questions ahead</span>}
      </div>

      {/* The section heading always sits on the same page as its paragraph. */}
      {heading && (
        <h2 className="mb-3 font-serif text-2xl font-bold leading-snug text-amber-950 sm:text-3xl">
          <ParaRuns runs={headingRuns} text={heading} subject={subject} />
        </h2>
      )}

      {kind === "heading" ? (
        !heading && (
          <h2 className="font-serif text-2xl font-bold leading-snug text-amber-950 sm:text-3xl">
            <ParaRuns runs={runs} text={text} subject={subject} />
          </h2>
        )
      ) : kind === "image" && imageUrl ? (
        <BookFigure src={imageUrl} caption={text} runs={runs} subject={subject} />
      ) : (
        <p className="whitespace-pre-line font-serif text-[17px] leading-[1.9] text-amber-950 sm:text-lg sm:leading-[2]">
          <ParaRuns runs={runs} text={text} subject={subject} />
        </p>
      )}

      {/* Figures live with their own caption, never on a lonely page. */}
      {figures.map((f, i) => (
        <BookFigure key={`${f.url}-${i}`} src={f.url} caption={f.caption} runs={f.runs} subject={subject} />
      ))}
    </article>
  );
}

function BookFigure({
  src,
  caption,
  runs,
  subject,
}: {
  src: string;
  caption: string;
  runs: Run[];
  subject: string;
}) {
  return (
    <figure className="mt-4">
      <img
        src={resolveBookImage(src) ?? ''}
        alt={caption || "NCERT figure"}
        loading="lazy"
        className="mx-auto max-h-[60vh] w-auto rounded-xl bg-white/60 p-2"
      />
      {caption && (
        <figcaption className="mt-3 text-center font-serif text-sm italic text-amber-900/70">
          <ParaRuns runs={(runs ?? []).filter((r) => r.t !== "img")} text={caption} subject={subject} />
        </figcaption>
      )}
    </figure>
  );
}

/* ----------------------------- question card -------------------------- */

function QuestionCard({
  subject,
  question,
  choice,
  result,
  onChoose,
  onSubmit,
  onSkip,
}: {
  subject: string;
  question: KeyPointQuestion;
  choice: string | null;
  result: { selected: string | null; correct: boolean; skipped: boolean } | null;
  onChoose: (key: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const answered = !!result;
  const selected = result?.selected ?? choice;

  // Local bookmark state
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("nugget_bookmarks");
      const list: string[] = stored ? JSON.parse(stored) : [];
      return list.includes(question.key);
    } catch {
      return false;
    }
  });

  const toggleBookmark = () => {
    try {
      const stored = localStorage.getItem("nugget_bookmarks");
      const list: string[] = stored ? JSON.parse(stored) : [];
      let next: string[];
      if (list.includes(question.key)) {
        next = list.filter((k) => k !== question.key);
        setIsBookmarked(false);
      } else {
        next = [...list, question.key];
        setIsBookmarked(true);
      }
      localStorage.setItem("nugget_bookmarks", JSON.stringify(next));
    } catch {}
  };

  const getDifficultyBadge = (diff: string | null) => {
    if (!diff) return null;
    const d = String(diff).toLowerCase().trim();
    if (d === "1" || d === "easy") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          ● Level 1 · Easy
        </span>
      );
    }
    if (d === "2" || d === "medium" || d === "med") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
          ● Level 2 · Medium
        </span>
      );
    }
    if (d === "3" || d === "hard") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
          ● Level 3 · Hard
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        {diff}
      </span>
    );
  };

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-soft sm:p-6 transition hover:shadow-md">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-600 dark:text-sky-400 font-extrabold">
            Question
          </span>
          {question.source === "pyq" && (
            <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-purple-600 dark:text-purple-400">
              PYQ
            </span>
          )}
          {question.year && <span>{question.year}</span>}
          {getDifficultyBadge(question.difficulty)}
        </div>

        <button
          onClick={toggleBookmark}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-secondary"
          title={isBookmarked ? "Remove bookmark" : "Bookmark question"}
        >
          {isBookmarked ? (
            <>
              <BookmarkCheck className="h-4 w-4 text-amber-500 fill-amber-500" />
              <span className="text-amber-600 dark:text-amber-400">Saved</span>
            </>
          ) : (
            <>
              <Bookmark className="h-4 w-4 text-muted-foreground" />
              <span>Bookmark</span>
            </>
          )}
        </button>
      </div>

      <PyqRichText html={question.question} className="text-[15px] font-semibold leading-relaxed" />
      {question.imageUrl && (
        <NcertPyqImage src={question.imageUrl} subject={subject} className="mt-3" />
      )}

      <div className="mt-4 space-y-2">
        {question.options.map((o) => {
          const isPicked = selected === o.key;
          const isRight = answered && question.correctKey === o.key;
          const isWrong = answered && isPicked && !result?.correct;
          return (
            <button
              key={o.key}
              disabled={answered}
              onClick={() => onChoose(o.key)}
              className={
                "flex w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm transition " +
                (isRight
                  ? "border-emerald-500/60 bg-emerald-500/10"
                  : isWrong
                    ? "border-destructive/60 bg-destructive/10"
                    : isPicked
                      ? "border-sky-500/60 bg-sky-500/10"
                      : "border-border hover:border-sky-500/40")
              }
            >
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
                  (isRight
                    ? "bg-emerald-500 text-white"
                    : isWrong
                      ? "bg-destructive text-white"
                      : isPicked
                        ? "bg-sky-500 text-white"
                        : "bg-secondary text-muted-foreground")
                }
              >
                {o.key}
              </span>
              <span className="flex-1 leading-relaxed">{o.text}</span>
            </button>
          );
        })}
      </div>

      {!answered && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={onSkip}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-secondary"
          >
            Skip for now
          </button>
          <button
            disabled={!choice}
            onClick={onSubmit}
            className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-40"
          >
            Submit answer
          </button>
        </div>
      )}

      {answered && (
        <div className="mt-4 rounded-2xl bg-secondary/50 p-4">
          <div className="flex items-center gap-2 font-bold text-sm">
            {result?.correct ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Correct answer!
              </span>
            ) : result?.skipped ? (
              <span className="text-muted-foreground">Question skipped</span>
            ) : (
              <span className="flex items-center gap-1.5 text-destructive">
                <X className="h-4 w-4" /> Incorrect
              </span>
            )}
          </div>
          {question.explanation && (
            <PyqRichText
              html={question.explanation}
              className="mt-2 text-sm text-muted-foreground"
            />
          )}
          {question.explanationImageUrl && (
            <NcertPyqImage src={question.explanationImageUrl} subject={subject} className="mt-3" />
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ analytics (redesigned) ----------------------------- */

function TopicAnalytics({
  chapter,
  topic,
  answers,
  onBack,
  onRevise,
}: {
  chapter: ChapterKeyPoints;
  topic: KeyPointTopic;
  answers: KeyPointAnswer[];
  onBack: () => void;
  onRevise: () => void;
}) {
  const [filterTab, setFilterTab] = useState<"all" | "mistakes" | "bookmarks">("all");
  const [bookmarkedKeys, setBookmarkedKeys] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("nugget_bookmarks");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

  const toggleBookmark = (key: string) => {
    setBookmarkedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem("nugget_bookmarks", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const byQuestion = useMemo(() => {
    const m = new Map<string, KeyPointAnswer>();
    for (const a of answers) m.set(`${a.source}:${a.question_id}`, a);
    return m;
  }, [answers]);

  const questions = useMemo(
    () =>
      topic.steps
        .filter((s): s is Extract<typeof s, { kind: "question" }> => s.kind === "question")
        .map((s) => s.question),
    [topic],
  );

  const responded = questions.filter((q) => byQuestion.has(q.key));
  const skippedList = responded.filter((q) => byQuestion.get(q.key)!.skipped);
  const attempted = responded.filter((q) => !byQuestion.get(q.key)!.skipped);
  const correct = attempted.filter((q) => byQuestion.get(q.key)!.is_correct).length;
  const wrong = attempted.length - correct;
  const skipped = skippedList.length;
  const accuracy = attempted.length ? Math.round((correct / attempted.length) * 100) : 0;

  // Weak vs Strong subtopic analysis (grouped by question subtopic or paragraph reference)
  const subtopicAnalysis = useMemo(() => {
    const groups: Record<string, { total: number; attempted: number; correct: number; questions: typeof questions }> = {};

    questions.forEach((q) => {
      const subKey = (q as any).topic || topic.title || "General Concept";
      if (!groups[subKey]) {
        groups[subKey] = { total: 0, attempted: 0, correct: 0, questions: [] };
      }
      groups[subKey].total += 1;
      groups[subKey].questions.push(q);
      const ans = byQuestion.get(q.key);
      if (ans && !ans.skipped) {
        groups[subKey].attempted += 1;
        if (ans.is_correct) groups[subKey].correct += 1;
      }
    });

    return Object.entries(groups).map(([name, data]) => {
      const acc = data.attempted ? Math.round((data.correct / data.attempted) * 100) : 0;
      const isWeak = data.attempted > 0 && acc < 60;
      const isStrong = data.attempted > 0 && acc >= 80;
      return {
        name,
        ...data,
        accuracy: acc,
        isWeak,
        isStrong,
      };
    });
  }, [questions, byQuestion, topic]);

  const weakTopics = subtopicAnalysis.filter((st) => st.isWeak);
  const strongTopics = subtopicAnalysis.filter((st) => st.isStrong);

  // Difficulty breakdown with 1=Easy, 2=Medium, 3=Hard
  const diffStats = useMemo(() => {
    const levels = [
      { key: "1", label: "Level 1 (Easy)", color: "text-emerald-500", bg: "bg-emerald-500", matches: ["1", "easy"] },
      { key: "2", label: "Level 2 (Medium)", color: "text-amber-500", bg: "bg-amber-500", matches: ["2", "medium", "med"] },
      { key: "3", label: "Level 3 (Hard)", color: "text-rose-500", bg: "bg-rose-500", matches: ["3", "hard"] },
    ];
    return levels.map((lvl) => {
      const qInLvl = questions.filter((q) => {
        const d = String(q.difficulty || "").toLowerCase().trim();
        return lvl.matches.includes(d);
      });
      const attInLvl = qInLvl.filter((q) => byQuestion.has(q.key) && !byQuestion.get(q.key)!.skipped);
      const corInLvl = attInLvl.filter((q) => byQuestion.get(q.key)!.is_correct).length;
      const acc = attInLvl.length ? Math.round((corInLvl / attInLvl.length) * 100) : 0;
      return {
        ...lvl,
        total: qInLvl.length,
        attempted: attInLvl.length,
        correct: corInLvl,
        accuracy: acc,
      };
    });
  }, [questions, byQuestion]);

  // Filtered question list
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const a = byQuestion.get(q.key);
      if (filterTab === "mistakes") {
        return a && !a.skipped && !a.is_correct;
      }
      if (filterTab === "bookmarks") {
        return bookmarkedKeys.has(q.key);
      }
      return !!a; // all answered/attempted
    });
  }, [questions, byQuestion, filterTab, bookmarkedKeys]);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="sticky top-0 z-20 -mx-3 flex items-center justify-between border-b bg-background/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm sm:text-base font-extrabold text-foreground">{topic.title}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Sparkles className="h-3 w-3" /> Analytics
              </span>
            </div>
            <div className="text-[11px] font-semibold text-muted-foreground">
              {chapter.chapter.title} · {questions.length} Questions
            </div>
          </div>
        </div>
        <button
          onClick={onRevise}
          className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:opacity-95 transition"
        >
          Revise Topic
        </button>
      </div>

      {/* Hero Visual Card matching Subject Quiz & Flashcards style */}
      <div className="relative isolate overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-sky-500/15 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Topic Mastery Status</span>
            <div className="flex items-center gap-3">
              <div className="text-3xl sm:text-4xl font-black text-foreground">
                {accuracy}%
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  {accuracy >= 80 ? "🌟 Excellent Mastery" : accuracy >= 60 ? "👍 Good Progress" : "⚠️ Weak Area — Needs Practice"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {correct} correct out of {attempted.length} attempted
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-border/80 bg-card/80 p-3 text-center min-w-[90px]">
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">+{correct * 4}</div>
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Score</div>
            </div>
            <div className="rounded-2xl border border-border/80 bg-card/80 p-3 text-center min-w-[90px]">
              <div className="text-lg font-black text-rose-500">-{wrong * 1}</div>
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Negative</div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistical Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <Stat label="Attempted" value={`${attempted.length}/${questions.length}`} color="text-sky-500" />
        <Stat label="Accuracy" value={`${accuracy}%`} color="text-indigo-500" />
        <Stat label="Correct / Wrong" value={`${correct} / ${wrong}`} color="text-emerald-500" />
        <Stat label="Skipped" value={String(skipped)} color="text-muted-foreground" />
        <Stat label="Bookmarks" value={String(bookmarkedKeys.size)} color="text-amber-500" />
      </div>

      {/* Weak & Strong Topics Diagnostic Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weak Topics Card */}
        <div className="rounded-3xl border border-rose-500/30 bg-rose-500/5 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-rose-500/20 p-2 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Weak Sub-Topics</h3>
                <p className="text-[10px] text-muted-foreground">Accuracy &lt; 60% based on your attempts</p>
              </div>
            </div>
            <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
              {weakTopics.length} Identified
            </span>
          </div>

          {weakTopics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rose-500/20 p-4 text-center text-xs text-muted-foreground">
              {attempted.length > 0 ? "🎉 No weak sub-topics found! Keep up the great work." : "Attempt questions to identify weak sub-topics."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {weakTopics.map((wt) => (
                <div key={wt.name} className="rounded-2xl border border-border bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="truncate max-w-[70%] font-bold text-foreground">{wt.name}</span>
                    <span className="text-rose-500 font-extrabold">{wt.accuracy}% Accuracy</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${wt.accuracy}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{wt.correct}/{wt.attempted} Correct</span>
                    <span className="text-primary font-semibold">Review paragraph</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strong & Mastered Topics Card */}
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Mastered Sub-Topics</h3>
                <p className="text-[10px] text-muted-foreground">Accuracy &ge; 80% with high confidence</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {strongTopics.length} Mastered
            </span>
          </div>

          {strongTopics.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-500/20 p-4 text-center text-xs text-muted-foreground">
              Practice more questions to reach 80%+ mastery!
            </div>
          ) : (
            <div className="space-y-2.5">
              {strongTopics.map((st) => (
                <div key={st.name} className="rounded-2xl border border-border bg-card p-3 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="truncate max-w-[70%] font-bold text-foreground">{st.name}</span>
                    <span className="text-emerald-500 font-extrabold">{st.accuracy}% Accuracy</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${st.accuracy}%` }} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{st.correct}/{st.attempted} Correct</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready for NEET</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Difficulty vs Accuracy Breakdown */}
      <div className="rounded-3xl border bg-card p-5 shadow-xs space-y-3">
        <div className="text-xs font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>Difficulty vs. Accuracy Breakdown (Level 1, 2, 3)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {diffStats.map((st) => (
            <div key={st.key} className="rounded-2xl border border-border/80 bg-secondary/30 p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span className="font-bold text-foreground">{st.label}</span>
                <span className={`font-extrabold ${st.color}`}>{st.accuracy}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${st.bg}`}
                  style={{ width: `${st.accuracy}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Attempted: <strong>{st.attempted}/{st.total}</strong></span>
                <span>Correct: <strong className="text-emerald-600 dark:text-emerald-400">{st.correct}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-1">
        <button
          onClick={() => setFilterTab("all")}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
            filterTab === "all"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          All Responses ({responded.length})
        </button>
        <button
          onClick={() => setFilterTab("mistakes")}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
            filterTab === "mistakes"
              ? "bg-rose-500 text-white shadow-xs"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          Mistakes ({wrong})
        </button>
        <button
          onClick={() => setFilterTab("bookmarks")}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
            filterTab === "bookmarks"
              ? "bg-amber-500 text-white shadow-xs"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          Bookmarked ({bookmarkedKeys.size})
        </button>
      </div>

      {/* Questions Review List */}
      {filteredQuestions.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          {filterTab === "mistakes"
            ? "🎉 Outstanding! No mistakes found in this topic."
            : filterTab === "bookmarks"
              ? "No questions bookmarked in this topic yet."
              : "No responses recorded yet. Complete reading and answering to see questions here."}
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredQuestions.map((q, idx) => {
            const a = byQuestion.get(q.key);
            const isBookmarked = bookmarkedKeys.has(q.key);
            return (
              <li key={q.key} className="rounded-2xl border bg-card p-4 sm:p-5 shadow-xs">
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-foreground font-black">Q{idx + 1}</span>
                    <span>{q.source === "pyq" ? "NCERT PYQ" : "Question Bank"}</span>
                    {q.difficulty && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">
                        Level {q.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          a.is_correct
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : a.skipped
                              ? "bg-secondary text-muted-foreground"
                              : "bg-rose-500/15 text-rose-500"
                        }`}
                      >
                        {a.is_correct ? "Correct" : a.skipped ? "Skipped" : "Wrong"}
                      </span>
                    )}
                    <button
                      onClick={() => toggleBookmark(q.key)}
                      className="rounded p-1 hover:bg-secondary text-muted-foreground transition"
                      aria-label="Bookmark question"
                    >
                      {isBookmarked ? (
                        <BookmarkCheck className="h-4 w-4 text-amber-500 fill-amber-500" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <PyqRichText html={q.question} className="text-sm font-semibold text-foreground" />

                <div className="mt-3 rounded-2xl bg-secondary/40 p-3 text-xs space-y-1.5">
                  {a && (
                    <div className="text-muted-foreground">
                      Your Choice: <strong className="text-foreground">{a.selected ?? "—"}</strong>
                      {a.skipped && " (Skipped)"}
                    </div>
                  )}
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                    Correct Answer: {q.correctKey ?? "—"}
                  </div>
                  {q.explanation && (
                    <div className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                      <strong className="text-foreground">NCERT Explanation: </strong>
                      <PyqRichText html={q.explanation} className="inline" />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3 sm:p-4 text-center shadow-xs">
      <div className={`text-base sm:text-lg font-black ${color || "text-foreground"}`}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}


interface RevisionModePlayerProps {
  chapter: ChapterKeyPoints;
  topic: KeyPointTopic;
  onExit: () => void;
  onAnalytics: () => void;
  nextTopicTitle?: string | null;
  onNextTopic?: () => void;
}

function RevisionModePlayer({
  chapter,
  topic,
  onExit,
  onAnalytics,
  nextTopicTitle,
  onNextTopic,
}: RevisionModePlayerProps) {
  // Aggregate all paras in this topic and their linked questions
  const parasWithQuestions = useMemo(() => {
    const list: Array<{ para: KeyPointPara; questions: KeyPointQuestion[] }> = [];
    for (const step of topic.steps) {
      if (step.kind === "para") {
        list.push({ para: step.para, questions: [...step.para.questions] });
      }
    }
    return list;
  }, [topic]);

  const [activeParaIdx, setActiveParaIdx] = useState(0);
  const [mobileTab, setMobileTab] = useState<"ncert" | "questions">("ncert");
  const [picked, setPicked] = useState<Record<string, { selected: string | null; correct: boolean; skipped: boolean }>>({});
  const [choices, setChoices] = useState<Record<string, string | null>>({});

  const current = parasWithQuestions[activeParaIdx] ?? parasWithQuestions[0];
  const totalParas = parasWithQuestions.length;

  if (!current) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        No NCERT content available for this topic.
        <div className="mt-4">
          <button onClick={onExit} className="rounded-full bg-secondary px-4 py-2 text-xs font-semibold">
            Back to topics
          </button>
        </div>
      </div>
    );
  }

  const handleSelectChoice = (qKey: string, opt: string) => {
    setChoices((prev) => ({ ...prev, [qKey]: opt }));
  };

  const handleAnswerSubmit = (q: KeyPointQuestion) => {
    const chosen = choices[q.key];
    if (!chosen) return;
    const isCorrect = chosen.trim().toLowerCase() === (q.correctKey || "").trim().toLowerCase();
    setPicked((prev) => ({
      ...prev,
      [q.key]: { selected: chosen, correct: isCorrect, skipped: false },
    }));
  };

  return (
    <div className="pb-32">
      {/* Sticky Top Header */}
      <div className="sticky top-0 z-30 -mx-3 mb-4 border-b bg-background/90 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{topic.title}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {chapter.chapter.title} · <span className="font-bold text-primary">Revision Mode (Split View)</span>
            </div>
          </div>
          <button
            onClick={onAnalytics}
            className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:text-foreground"
          >
            Analytics
          </button>
        </div>

        {/* Page navigator & Mobile Tab Switcher */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Section {activeParaIdx + 1} of {totalParas}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={activeParaIdx === 0}
                onClick={() => {
                  setActiveParaIdx((i) => Math.max(0, i - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="rounded-md border p-1 text-xs disabled:opacity-30 hover:bg-secondary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={activeParaIdx >= totalParas - 1}
                onClick={() => {
                  setActiveParaIdx((i) => Math.min(totalParas - 1, i + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="rounded-md border p-1 text-xs disabled:opacity-30 hover:bg-secondary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mobile switcher: NCERT content vs Questions */}
          <div className="flex rounded-full bg-muted p-0.5 lg:hidden">
            <button
              onClick={() => setMobileTab("ncert")}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                mobileTab === "ncert" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              📖 NCERT Page
            </button>
            <button
              onClick={() => setMobileTab("questions")}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                mobileTab === "questions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <span>❓ Questions</span>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {current.questions.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Body: Desktop 50/50, Mobile Responsive Tabs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column: NCERT Content Page */}
        <div className={`space-y-4 ${mobileTab === "questions" ? "hidden lg:block" : "block"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              NCERT Textbook Content
            </h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Active Concept
            </span>
          </div>

          <div className="sticky top-24">
            <PaperPage
              subject={chapter.chapter.subject}
              para={current.para}
              questionCount={current.questions.length}
            />
          </div>
        </div>

        {/* Right Column: Questions related to this page */}
        <div className={`space-y-4 ${mobileTab === "ncert" ? "hidden lg:block" : "block"}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Questions from this page ({current.questions.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Instant Feedback & Solution
            </span>
          </div>

          {current.questions.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No direct questions attached to this paragraph yet. Advance to the next section!
            </div>
          ) : (
            <div className="space-y-4">
              {current.questions.map((q, idx) => (
                <QuestionCard
                  key={q.key}
                  subject={chapter.chapter.subject}
                  question={q}
                  result={picked[q.key] ?? null}
                  choice={choices[q.key] ?? null}
                  onChoose={(opt) => handleSelectChoice(q.key, opt)}
                  onSubmit={() => handleAnswerSubmit(q)}
                  onSkip={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            disabled={activeParaIdx === 0}
            onClick={() => {
              setActiveParaIdx((i) => Math.max(0, i - 1));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="rounded-full border px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-40 hover:bg-secondary"
          >
            ← Previous Section
          </button>

          {activeParaIdx < totalParas - 1 ? (
            <button
              onClick={() => {
                setActiveParaIdx((i) => Math.min(totalParas - 1, i + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Next Section →
            </button>
          ) : onNextTopic ? (
            <button
              onClick={onNextTopic}
              className="flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-500/20"
            >
              Next Topic: {nextTopicTitle ?? "Continue"} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onExit}
              className="rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm"
            >
              Finish Revision ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
