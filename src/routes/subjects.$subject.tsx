import { MissionBanner } from "@/components/mission-banner";
import { publicMediaAsset } from "@/lib/media-assets";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ChevronDown,
  Play,
  Atom,
  FlaskConical,
  Leaf,
  SlidersHorizontal,
  Search,
  Dices,
  Clock,
  Sparkles,
  BookOpen,
  RotateCcw,
  CheckCircle2,
  Trophy,
  X,
  Layers,
  Minus,
  Plus,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TopicPicker, TopicPickerLoading, useTopicTree } from "@/components/topic-picker";
import { countSelectedTopics, toTopicFilter } from "@/lib/topic-tree";
import { mixQuestions, type MixableQuestion } from "@/lib/question-mix";
import type { QuizMode } from "@/components/quiz-mode-picker";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { HubHero, type TileAccent } from "@/components/nav-tiles";
import {
  getSubjectChapters,
  getChapterQuestionPool,
  createPracticeTest,
} from "@/lib/practice-mysql.functions";

export const Route = createFileRoute("/subjects/$subject")({
  head: () => ({ meta: [{ title: "Subject — Neet Buddy" }] }),
  validateSearch: (search: Record<string, unknown>): {
    search?: string;
    chapter?: string;
    count?: number;
    autoOpen?: boolean;
    level_id?: string;
    mission_id?: string;
    source?: string;
  } => ({
    search: typeof search.search === "string" ? search.search : undefined,
    chapter: typeof search.chapter === "string" ? search.chapter : undefined,
    count: !isNaN(Number(search.count)) ? Number(search.count) : undefined,
    autoOpen: search.autoOpen === "1" || search.autoOpen === "true" || search.autoOpen === true,
    level_id: search.level_id != null ? String(search.level_id) : undefined,
    mission_id: search.mission_id != null ? String(search.mission_id) : undefined,
    source: search.source != null ? String(search.source) : undefined,
  }),
  component: SubjectPage,
});

type Chapter = { id: string; name: string; order_index: number; q_count?: number };

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Very Hard"] as const;
const QTYPES = [
  { value: "MCQ", label: "Standard MCQ" },
  { value: "MCQ type-2", label: "Multi-statement (type 2)" },
  { value: "MCQ type-3", label: "Multi-statement (type 3)" },
  { value: "Assertion and Reason", label: "Assertion & Reason" },
  { value: "Match the following", label: "Match the columns" },
  { value: "Graph/Figure", label: "Diagram / graph based" },
] as const;

const META: Record<
  string,
  { icon: typeof Atom; tint: string; accent: TileAccent; image: string; alt: string; blurb: string }
> = {
  Physics: {
    icon: Atom,
    tint: "from-sky-100 to-blue-100",
    accent: "blue",
    image: publicMediaAsset("illustrations/banner-physics.png"),
    alt: "3D atom, magnet and lightning bolt illustration",
    blurb: "Numericals first, then concept one-liners — chapter by chapter.",
  },
  Chemistry: {
    icon: FlaskConical,
    tint: "from-orange-100 to-amber-100",
    accent: "orange",
    image: publicMediaAsset("illustrations/banner-chemistry.png"),
    alt: "3D lab flasks and molecule illustration",
    blurb: "Physical, Organic and Inorganic chapters in one flow.",
  },
  Biology: {
    icon: Leaf,
    tint: "from-emerald-100 to-green-100",
    accent: "emerald",
    image: publicMediaAsset("illustrations/banner-biology.png"),
    alt: "3D leaf, DNA helix and microscope illustration",
    blurb: "NCERT-aligned Botany and Zoology, 360 marks worth of practice.",
  },
};

type Filters = { difficulty: string; qtype: string };

async function fetchChapterQuestions(
  chapterId: string,
  filters: Filters,
  topicFilter: { fullTopicIds: string[]; subtopicIds: string[]; everything: boolean },
): Promise<MixableQuestion[]> {
  try {
    return await getChapterQuestionPool({
      data: {
        chapterId: String(chapterId),
        difficulty: filters.difficulty,
        qtype: filters.qtype,
        topicIds: topicFilter.everything ? [] : topicFilter.fullTopicIds,
        subtopicIds: topicFilter.everything ? [] : topicFilter.subtopicIds,
      },
    });
  } catch (e) {
    console.warn("fetchChapterQuestions failed:", e);
    return [];
  }
}

// Fisher-Yates array shuffle for true random question distribution
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function SubjectPage() {
  const { subject } = Route.useParams();
  const searchParams = Route.useSearch();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.search ?? searchParams.chapter ?? "");
  const [difficulty, setDifficulty] = useState<string>("any");
  const [qtype, setQType] = useState<string>("any");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    let cancelled = false;
    setChapters(null);
    (async () => {
      try {
        const list = (await getSubjectChapters({
          data: { subject, difficulty, qtype },
        })) as Chapter[];
        if (cancelled) return;
        setChapters(list);
        if (searchParams.chapter || searchParams.search) {
          const query = (searchParams.chapter || searchParams.search || "").toLowerCase();
          const cleanQ = query.replace(/^\d+[.:]\s*/, "").trim();
          const found = list.find((ch) => {
            const name = ch.name.toLowerCase();
            return name.includes(cleanQ) || cleanQ.includes(name);
          });
          if (found) {
            setSelectedChapter(found);
          }
        }
      } catch (e) {
        console.warn("chapter load failed:", e);
        if (!cancelled) setChapters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, difficulty, qtype]);

  const treeChapterIds = useMemo(
    () => (expanded ? [expanded] : selectedChapter ? [selectedChapter.id] : []),
    [expanded, selectedChapter],
  );
  const { tree, loading: treeLoading } = useTopicTree(treeChapterIds);
  const topicStats = countSelectedTopics(tree, excluded);

  const toggleExcluded = useCallback((keys: string[], exclude: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) (exclude ? next.add(k) : next.delete(k));
      return next;
    });
  }, []);

  const filteredChapters = useMemo(() => {
    if (!chapters) return [];
    if (!searchQuery.trim()) return chapters;
    const q = searchQuery.toLowerCase().trim();
    return chapters.filter((c) => c.name.toLowerCase().includes(q));
  }, [chapters, searchQuery]);

  const activeFiltersCount =
    (difficulty !== "any" ? 1 : 0) +
    (qtype !== "any" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (excluded.size > 0 ? 1 : 0);

  const resetFilters = () => {
    setDifficulty("any");
    setQType("any");
    setSearchQuery("");
    setExcluded(new Set());
  };

  const handleRandomChapter = () => {
    const pool = (filteredChapters.length ? filteredChapters : chapters ?? []).filter(
      (c) => (c.q_count ?? 0) > 0,
    );
    if (!pool.length) {
      toast.error("No chapters with available questions found.");
      return;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    setSelectedChapter(picked);
    toast.success(`Selected "${picked.name}"!`);
  };

  const startPractice = async (
    chapter: Chapter,
    mode: QuizMode,
    options: { count: number; timerMin: number },
  ) => {
    if (!user) return;
    setLaunching(chapter.id);
    setSelectedChapter(null);
    try {
      const topicFilter = toTopicFilter(tree, excluded);
      if (!topicFilter.everything && !topicFilter.fullTopicIds.length && !topicFilter.subtopicIds.length) {
        toast.error("Select at least one sub-topic.");
        return;
      }
      const rows = await fetchChapterQuestions(chapter.id, { difficulty, qtype }, topicFilter);
      if (!rows.length) {
        toast.error("No questions match the selected filters.");
        return;
      }

      // Mix and randomly shuffle questions for a fresh randomized session every time
      const mixed = mixQuestions(rows, `${chapter.id}:${difficulty}:${qtype}:${Date.now()}`).map((r) => r.id);
      const shuffled = shuffleArray(mixed);
      const targetCount = options.count > 0 ? Math.min(options.count, shuffled.length) : shuffled.length;
      const qids = shuffled.slice(0, targetCount);

      const filterTag = [
        difficulty !== "any" ? difficulty : null,
        qtype !== "any" ? qtype : null,
        topicFilter.everything ? null : `${topicStats.selected} topics`,
      ]
        .filter(Boolean)
        .join(", ");

      const timerTag = options.timerMin > 0 ? `${options.timerMin}m` : "Untimed";
      const title = `${subject} · ${chapter.name} (${qids.length} Qs · ${timerTag}${filterTag ? ` · ${filterTag}` : ""})`;

      let testId: string | undefined;
      try {
        const res = await createPracticeTest({
          data: {
            title,
            questionIds: qids,
            difficulty: difficulty !== "any" ? difficulty : "medium",
            durationMin: options.timerMin,
          },
        });
        testId = res.testId;
      } catch (serverErr) {
        // Hostinger/PHP fallback: create the test through /api/quiz.php
        console.warn("createPracticeTest failed, trying /api/quiz.php fallback", serverErr);
        const r = await fetch("/api/quiz.php?action=createSubjectQuiz", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            chapter_id: chapter.id,
            title,
            qids,
            count: qids.length,
            difficulty: difficulty !== "any" ? difficulty : "medium",
          }),
        });
        if (!r.ok) throw serverErr;
        const data = await r.json();
        const id = data?.test_id || data?.testId || data?.id;
        if (!id) throw serverErr;
        testId = String(id);
      }

      nav({ to: "/quiz/$testId", params: { testId }, search: { mode } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not launch quiz");
    } finally {
      setLaunching(null);
    }
  };

  const meta = META[subject] ?? META.Physics;
  const Icon = meta.icon;

  return (
    <PageShell>
      <MissionBanner />
      <HubHero
        variant="banner"
        compact
        eyebrow="Subject Practice"
        title={subject}
        highlight="Chapter Quiz"
        description={meta.blurb}
        Icon={Icon}
        accent={meta.accent}
        image={meta.image}
        imageAlt={meta.alt}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs font-semibold shadow-xs backdrop-blur">
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            {chapters?.length ?? 0} chapters
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRandomChapter}
            disabled={!chapters || chapters.length === 0}
            className="h-7 gap-1.5 rounded-full border-primary/30 bg-background/80 px-3 text-xs font-semibold text-primary hover:bg-primary/10 shadow-xs backdrop-blur"
          >
            <Dices className="h-3.5 w-3.5" />
            Random Chapter
          </Button>
        </div>
      </HubHero>

      {/* Concise Filter Bar */}
      <div className="mb-2 rounded-xl border border-border/50 bg-card/50 px-2 py-1 shadow-xs backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Chapter Search */}
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${subject}...`}
              className="h-8 pl-8 pr-7 text-xs bg-background/80 rounded-lg border-border/60"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Difficulty */}
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger className="h-8 min-w-[110px] rounded-lg border-border/60 bg-secondary/50 px-2 text-xs">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All levels</SelectItem>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Question Type */}
          <Select value={qtype} onValueChange={setQType}>
            <SelectTrigger className="h-8 min-w-[115px] rounded-lg border-border/60 bg-secondary/50 px-2 text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">All types</SelectItem>
              {QTYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quick Random Action */}
          <Button
            size="sm"
            onClick={handleRandomChapter}
            disabled={!chapters || chapters.length === 0}
            className="h-8 gap-1 rounded-lg bg-gradient-primary px-2.5 text-xs font-medium shadow-xs shrink-0"
          >
            <Dices className="h-3.5 w-3.5" />
            <span>Random</span>
          </Button>

          {activeFiltersCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Chapters Count & Feedback */}
      <div className="mb-2.5 flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Showing {filteredChapters.length} of {chapters?.length ?? 0} chapters
        </span>
      </div>

      {/* Chapters Listing */}
      {chapters === null ? (
        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
          <span className="text-xs">Loading {subject} chapters...</span>
        </div>
      ) : filteredChapters.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="p-10 text-center space-y-3">
            <div className="text-sm font-semibold">No chapters match your filters</div>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search query, difficulty, or question type filters.
            </p>
            {activeFiltersCount > 0 && (
              <Button size="sm" variant="outline" onClick={resetFilters} className="rounded-xl text-xs">
                Reset all filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredChapters.map((c, i) => {
            const isOpen = expanded === c.id;
            const qCount = c.q_count ?? 0;
            return (
              <div
                key={c.id}
                className={cn(
                  "rounded-2xl border border-border bg-card shadow-xs transition hover:border-primary/40 hover:shadow-sm",
                  isOpen && "ring-1 ring-primary/20",
                )}
              >
                <div className="flex items-center gap-3 p-3.5 sm:p-4">
                  {/* Chapter number pill */}
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/80 text-xs sm:text-sm font-bold text-foreground">
                    {i + 1}
                  </span>

                  {/* Chapter Details */}
                  <button
                    onClick={() => setSelectedChapter(c)}
                    disabled={qCount === 0 || launching === c.id}
                    className="min-w-0 flex-1 text-left group disabled:opacity-50"
                  >
                    <div className="text-sm sm:text-base font-semibold leading-tight text-foreground group-hover:text-primary transition-colors">
                      {c.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <BookOpen className="h-3 w-3" />
                        {c.q_count === undefined ? "Counting..." : `${c.q_count} Questions`}
                      </span>
                      {activeFiltersCount > 0 && c.q_count !== undefined && (
                        <span className="text-[11px] text-primary/80 font-medium">(filtered)</span>
                      )}
                    </div>
                  </button>

                  {/* Subtopics Toggle */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    aria-label={isOpen ? "Hide sub-topics" : "Choose sub-topics"}
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    <Layers className="h-3.5 w-3.5 hidden sm:inline" />
                    <span className="hidden sm:inline">Topics</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
                  </Button>

                  {/* Start Practice Button */}
                  <Button
                    size="sm"
                    className="h-8 sm:h-9 gap-1.5 rounded-xl bg-gradient-primary px-3 sm:px-4 text-xs font-semibold shadow-xs"
                    disabled={qCount === 0 || launching === c.id}
                    onClick={() => setSelectedChapter(c)}
                  >
                    {launching === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span className="hidden xs:inline">Practice</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Subtopic Filter Expansion */}
                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-3 rounded-b-2xl">
                    <div className="mb-2 text-xs font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Select Sub-topics to practice:</span>
                    </div>
                    {treeLoading ? (
                      <TopicPickerLoading />
                    ) : (
                      <TopicPicker
                        topics={tree.find((t) => t.chapterId === c.id)?.topics ?? []}
                        excluded={excluded}
                        onToggle={toggleExcluded}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Practice Configuration Modal with Randomizers */}
      <PracticeConfigModal
        chapter={selectedChapter}
        subject={subject}
        busy={launching !== null}
        onClose={() => setSelectedChapter(null)}
        onStart={(chapter, mode, opts) => startPractice(chapter, mode, opts)}
      />

      <div className="mt-8 flex items-center justify-between border-t border-border/40 pt-4">
        <Button asChild variant="ghost" className="text-xs">
          <Link to="/quiz/subjects">← Other Subjects</Link>
        </Button>
        <Button asChild variant="ghost" className="text-xs">
          <Link to="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Practice Configuration Modal with Random Selectors                */
/* ------------------------------------------------------------------ */

type PracticeConfigModalProps = {
  chapter: Chapter | null;
  subject: string;
  busy: boolean;
  onClose: () => void;
  onStart: (chapter: Chapter, mode: QuizMode, options: { count: number; timerMin: number }) => void;
};

const COUNT_PRESETS = [10, 20, 30, 45];
const TIMER_PRESETS = [
  { label: "Untimed", value: 0 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "45 min", value: 45 },
  { label: "60 min", value: 60 },
];

function PracticeConfigModal({ chapter, subject, busy, onClose, onStart }: PracticeConfigModalProps) {
  const isMobile = useIsMobile();
  const maxPool = Math.max(5, chapter?.q_count ?? 30);

  // Standard default count: 25 (clamped to available questions)
  const [count, setCount] = useState<number>(() => Math.min(25, maxPool));
  // Standard default timer: 25 minutes
  const [timer, setTimer] = useState<number>(25);
  const [mode, setMode] = useState<QuizMode>("quiz");

  useEffect(() => {
    if (chapter) {
      const available = Math.max(5, chapter.q_count ?? 30);
      setCount(Math.min(25, available));
    }
  }, [chapter]);

  if (!chapter) return null;

  const stepCount = (delta: number) => {
    setCount((prev) => Math.min(maxPool, Math.max(5, prev + delta)));
  };

  const stepTimer = (delta: number) => {
    setTimer((prev) => Math.min(180, Math.max(0, prev + delta)));
  };

  const content = (
    <div className="space-y-3 py-1 text-xs">
      {/* Chapter Context Header */}
      <div className="rounded-xl bg-secondary/40 border border-border/60 px-3 py-2 flex items-center justify-between">
        <div className="min-w-0 pr-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{subject}</span>
          <h4 className="text-xs font-semibold text-foreground truncate">{chapter.name}</h4>
        </div>
        <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background shrink-0">
          {chapter.q_count ?? 0} Qs total
        </Badge>
      </div>

      {/* 1. Questions Selector (Standard 25 with +/- 5 steppers) */}
      <div className="rounded-xl border border-border/60 bg-card p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span>Questions</span>
          </label>
          <span className="text-xs font-bold text-primary">
            {count} Questions
          </span>
        </div>

        {/* Stepper + Input */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => stepCount(-5)}
            disabled={count <= 5}
            className="h-8 w-10 px-0 shrink-0 rounded-lg text-xs font-bold"
            title="Decrease 5 questions"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <div className="flex-1 text-center font-extrabold text-sm text-foreground bg-secondary/40 py-1.5 rounded-lg border border-border/40">
            {count} <span className="text-xs font-medium text-muted-foreground">Qs</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => stepCount(5)}
            disabled={count >= maxPool}
            className="h-8 w-10 px-0 shrink-0 rounded-lg text-xs font-bold"
            title="Increase 5 questions"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {[10, 25, 45].map((n) => {
            const disabled = maxPool < n;
            const active = count === n;
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => setCount(n)}
                className={cn(
                  "flex-1 rounded-md border py-1 text-[11px] font-semibold transition disabled:opacity-30",
                  active
                    ? "border-primary bg-primary/10 text-primary font-bold"
                    : "border-border/60 bg-secondary/20 text-muted-foreground hover:text-foreground",
                )}
              >
                {n}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCount(maxPool)}
            className={cn(
              "flex-1 rounded-md border py-1 text-[11px] font-semibold transition",
              count === maxPool
                ? "border-primary bg-primary/10 text-primary font-bold"
                : "border-border/60 bg-secondary/20 text-muted-foreground hover:text-foreground",
            )}
          >
            All ({maxPool})
          </button>
        </div>
      </div>

      {/* 2. Timer Selector (Standard 25m with +/- 5 steppers) */}
      <div className="rounded-xl border border-border/60 bg-card p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Duration</span>
          </label>
          <span className="text-xs font-bold text-primary">
            {timer === 0 ? "Untimed" : `${timer} min`}
          </span>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => stepTimer(-5)}
            disabled={timer <= 0}
            className="h-8 w-10 px-0 shrink-0 rounded-lg text-xs font-bold"
            title="Decrease 5 minutes"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          <div className="flex-1 text-center font-extrabold text-sm text-foreground bg-secondary/40 py-1.5 rounded-lg border border-border/40">
            {timer === 0 ? "Untimed (No limit)" : `${timer} min`}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => stepTimer(5)}
            disabled={timer >= 180}
            className="h-8 w-10 px-0 shrink-0 rounded-lg text-xs font-bold"
            title="Increase 5 minutes"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Quick timer presets */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => setTimer(0)}
            className={cn(
              "flex-1 rounded-md border py-1 text-[11px] font-semibold transition",
              timer === 0
                ? "border-primary bg-primary/10 text-primary font-bold"
                : "border-border/60 bg-secondary/20 text-muted-foreground hover:text-foreground",
            )}
          >
            Untimed
          </button>
          {[15, 25, 45, 60].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimer(t)}
              className={cn(
                "flex-1 rounded-md border py-1 text-[11px] font-semibold transition",
                timer === t
                  ? "border-primary bg-primary/10 text-primary font-bold"
                  : "border-border/60 bg-secondary/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {t}m
            </button>
          ))}
        </div>
      </div>

      {/* 3. Mode Toggle (Compact) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("quiz")}
          className={cn(
            "flex flex-col text-left rounded-xl border p-2.5 transition",
            mode === "quiz"
              ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-xs"
              : "border-border/60 bg-card hover:border-border",
          )}
        >
          <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Quiz Mode
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">Instant solutions</span>
        </button>

        <button
          type="button"
          onClick={() => setMode("cbt")}
          className={cn(
            "flex flex-col text-left rounded-xl border p-2.5 transition",
            mode === "cbt"
              ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40 shadow-xs"
              : "border-border/60 bg-card hover:border-border",
          )}
        >
          <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
            <Trophy className="h-3.5 w-3.5 text-emerald-500" />
            CBT Exam
          </span>
          <span className="text-[10px] text-muted-foreground mt-0.5">Real NEET test feel</span>
        </button>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center gap-2 pt-2">
      <Button variant="outline" size="sm" onClick={onClose} disabled={busy} className="h-9 flex-1 rounded-xl text-xs font-medium">
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={busy || count < 1}
        onClick={() => onStart(chapter, mode, { count, timerMin: timer })}
        className="h-9 flex-1 gap-1.5 rounded-xl bg-gradient-primary text-xs font-bold shadow-xs"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Starting...</span>
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Start Practice</span>
          </>
        )}
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={Boolean(chapter)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="rounded-t-3xl p-4 max-h-[92vh] overflow-y-auto">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-sm font-bold flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>Configure Practice</span>
            </SheetTitle>
          </SheetHeader>
          {content}
          <SheetFooter className="mt-3">{footer}</SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={Boolean(chapter)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-5">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <span>Configure Practice</span>
          </DialogTitle>
        </DialogHeader>
        {content}
        <DialogFooter className="mt-2">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


