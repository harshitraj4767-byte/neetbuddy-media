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

  if (topic && (mode === "experience" || mode === "revision")) {
    const ti = data.topics.findIndex((t) => t.key === topic.key);
    const nextTopic = ti >= 0 ? data.topics[ti + 1] : undefined;
    return (
      <TopicPlayer
        key={topic.key + mode}
        chapter={data}
        topic={topic}
        mode={mode}
        startIndex={mode === "revision" ? 0 : (progress[topic.key]?.step_index ?? 0)}
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
  const [picked, setPicked] = useState<Record<string, { selected: string | null; correct: boolean }>>(
    () => {
      const seed: Record<string, { selected: string | null; correct: boolean }> = {};
      if (mode !== "revision")
        for (const a of pastAnswers)
          seed[`${a.source}:${a.question_id}`] = {
            selected: a.selected,
            correct: a.is_correct,
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
    setPicked((m) => ({ ...m, [q.key]: { selected, correct } }));
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
              src={resolveBookImage(runImageSrc(r), subject)}
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
        src={resolveBookImage(src, subject)}
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

  // Difficulty breakdown
  const diffStats = useMemo(() => {
    const levels = [
      { key: "1", label: "Level 1 (Easy)", matches: ["1", "easy"] },
      { key: "2", label: "Level 2 (Medium)", matches: ["2", "medium", "med"] },
      { key: "3", label: "Level 3 (Hard)", matches: ["3", "hard"] },
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
    <div className="space-y-4">
      {/* Top Header */}
      <div className="sticky top-0 z-20 -mx-3 flex items-center justify-between border-b bg-background/90 px-3 py-2.5 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            aria-label="Back to topics"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-foreground">{topic.title} · Analytics Hub</h2>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {chapter.chapter.title}
            </div>
          </div>
        </div>
        <button
          onClick={onRevise}
          className="rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:opacity-95"
        >
          Revise Topic
        </button>
      </div>

      {/* Performance Scorecard */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Stat label="Attempted" value={`${attempted.length}/${questions.length}`} />
        <Stat label="Accuracy" value={`${accuracy}%`} />
        <Stat label="Correct / Wrong" value={`${correct} / ${wrong}`} />
        <Stat label="Skipped" value={String(skipped)} />
        <Stat label="Bookmarks" value={String(bookmarkedKeys.size)} />
      </div>

      {/* Difficulty vs Accuracy Grid */}
      <div className="rounded-2xl border bg-card p-4 shadow-xs">
        <div className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>Difficulty vs. Accuracy Breakdown</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {diffStats.map((st) => (
            <div key={st.key} className="rounded-xl border border-border/70 bg-secondary/30 p-3">
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span>{st.label}</span>
                <span className="font-bold text-primary">{st.accuracy}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${st.accuracy}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Attempted: {st.attempted}/{st.total}</span>
                <span>Correct: {st.correct}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-1">
        <button
          onClick={() => setFilterTab("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            filterTab === "all"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          All Responses ({responded.length})
        </button>
        <button
          onClick={() => setFilterTab("mistakes")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            filterTab === "mistakes"
              ? "bg-destructive text-destructive-foreground shadow-xs"
              : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          Mistakes ({wrong})
        </button>
        <button
          onClick={() => setFilterTab("bookmarks")}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
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
        <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-muted-foreground">
          {filterTab === "mistakes"
            ? "Great job! No mistakes found in this topic."
            : filterTab === "bookmarks"
              ? "No questions bookmarked in this topic yet."
              : "No responses recorded yet. Complete the reading steps to see analysis."}
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredQuestions.map((q, idx) => {
            const a = byQuestion.get(q.key);
            const isBookmarked = bookmarkedKeys.has(q.key);
            return (
              <li key={q.key} className="rounded-2xl border bg-card p-4 shadow-xs">
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>Q{idx + 1}</span>
                    <span>{q.source === "pyq" ? "PYQ" : "Question Bank"}</span>
                    {q.difficulty && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">
                        Diff: {q.difficulty}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          a.is_correct
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : a.skipped
                              ? "bg-secondary text-muted-foreground"
                              : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {a.is_correct ? "Correct" : a.skipped ? "Skipped" : "Wrong"}
                      </span>
                    )}
                    <button
                      onClick={() => toggleBookmark(q.key)}
                      className="rounded p-1 hover:bg-secondary text-muted-foreground"
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

                <div className="mt-3 rounded-xl bg-secondary/40 p-2.5 text-xs">
                  {a && (
                    <div className="mb-1 text-muted-foreground">
                      Your Choice: <strong className="text-foreground">{a.selected ?? "—"}</strong>
                      {a.skipped && " (Skipped)"}
                    </div>
                  )}
                  <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Correct Answer: {q.correctKey ?? "—"}
                  </div>
                  {q.explanation && (
                    <div className="mt-2 border-t border-border/50 pt-1.5 text-xs text-muted-foreground">
                      <strong>Explanation: </strong>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3.5 text-center shadow-xs">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
