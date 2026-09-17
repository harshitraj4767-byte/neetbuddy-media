import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, Play, Atom, FlaskConical, Leaf, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TopicPicker, TopicPickerLoading, useTopicTree } from "@/components/topic-picker";
import { countSelectedTopics, toTopicFilter } from "@/lib/topic-tree";
import { mixQuestions, type MixableQuestion } from "@/lib/question-mix";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { CheckCircle2, RotateCcw, Eye } from "lucide-react";
import { HubHero, type TileAccent } from "@/components/nav-tiles";

export const Route = createFileRoute("/subjects/$subject")({
  head: () => ({ meta: [{ title: "Subject — Neet Buddy" }] }),
  component: SubjectPage,
});

type Chapter = { id: string; name: string; order_index: number; q_count?: number };

// These values are stored EXACTLY like this in qb_questions — the old filters
// sent lowercase slugs (`easy`, `assertion_reason`) against a column holding
// `Easy` / `Assertion and Reason`, which is why every filtered quiz came back
// empty.
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
    image: "/illustrations/banner-physics.png",
    alt: "3D atom, magnet and lightning bolt illustration",
    blurb: "Numericals first, then concept one-liners — chapter by chapter.",
  },
  Chemistry: {
    icon: FlaskConical,
    tint: "from-orange-100 to-amber-100",
    accent: "orange",
    image: "/illustrations/banner-chemistry.png",
    alt: "3D lab flasks and molecule illustration",
    blurb: "Physical, Organic and Inorganic chapters in one flow.",
  },
  Biology: {
    icon: Leaf,
    tint: "from-emerald-100 to-green-100",
    accent: "emerald",
    image: "/illustrations/banner-biology.png",
    alt: "3D leaf, DNA helix and microscope illustration",
    blurb: "NCERT-aligned Botany and Zoology, 360 marks worth of practice.",
  },
};

type Filters = { difficulty: string; qtype: string };

/**
 * Pull every matching question row (id + the fields the mixer needs), paging
 * past PostgREST's 1000-row cap.
 */
async function fetchChapterQuestions(
  chapterId: string,
  filters: Filters,
  topicFilter: { fullTopicIds: string[]; subtopicIds: string[]; everything: boolean },
): Promise<MixableQuestion[]> {
  try {
    const params = new URLSearchParams({ chapter_id: String(chapterId), limit: "1000" });
    if (filters.difficulty !== "any") params.set("difficulty", filters.difficulty);
    if (filters.qtype !== "any") params.set("qtype", filters.qtype);
    // The API filters in SQL, so an empty list genuinely means "nothing matches"
    // rather than "the first page happened to contain no match".
    const res = await fetch(`/api/questions.php?${params.toString()}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.questions) ? data.questions : [];
      return list.map((q: any) => ({
        id: String(q.id),
        text: q.question_html || q.question_text || q.text || "",
        qtype: q.qtype || "MCQ",
        question_image_url: q.question_image_url || null,
      }));
    }
  } catch (e) {
    console.warn("fetchChapterQuestions failed:", e);
  }
  return [];
}

function SubjectPage() {
  const { subject } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<string>("any");
  const [qtype, setQType] = useState<string>("any");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [modePick, setModePick] = useState<Chapter | null>(null);
  const [cbtPlan, setCbtPlan] = useState<CbtPlan | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  // Chapters (and the question count matching the current filters) come straight
  // from the live question bank.
  useEffect(() => {
    let cancelled = false;
    setChapters(null);
    (async () => {
      try {
        const params = new URLSearchParams({ action: "getSubjectQuestions", subject });
        if (difficulty !== "any") params.set("difficulty", difficulty);
        if (qtype !== "any") params.set("qtype", qtype);
        const res = await fetch(`/api/quiz.php?${params.toString()}`, { credentials: "include" });
        const data = res.ok ? await res.json() : { chapters: [] };
        if (cancelled) return;
        const list = (Array.isArray(data.chapters) ? data.chapters : []).map((c: any, i: number) => ({
          id: String(c.id),
          name: String(c.name ?? ""),
          order_index: Number(c.order_index ?? i),
          q_count: Number(c.q_count ?? 0),
        })) as Chapter[];
        setChapters(list);
      } catch (e) {
        console.warn("chapter load failed:", e);
        if (!cancelled) setChapters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subject, difficulty, qtype]);

  // Sub-topic tree for whichever chapter is currently expanded / launching.
  const treeChapterIds = useMemo(
    () => (expanded ? [expanded] : modePick ? [modePick.id] : []),
    [expanded, modePick],
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

  const startChapter = async (chapter: Chapter, mode: QuizMode) => {
    if (!user) return;
    setLaunching(chapter.id);
    setModePick(null);
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
      // Rich formats first, rotating between them and woven with one-liners.
      const qids = mixQuestions(rows, `${chapter.id}:${difficulty}:${qtype}`).map((r) => r.id);


      const filterTag = [
        difficulty !== "any" ? difficulty : null,
        qtype !== "any" ? qtype : null,
        topicFilter.everything ? null : `${topicStats.selected} topics`,
      ]
        .filter(Boolean)
        .join(", ");
      const title = `${subject} · ${chapter.name}${filterTag ? ` (${filterTag})` : ""}`;

      // CBT mode: a chapter can hold hundreds of questions, which nobody can
      // sit through in one timed paper. Split them into fixed-size sets and
      // let the student pick which set to attempt. Each set is submitted and
      // scored on its own, exactly like a mini NTA paper.
      if (mode === "cbt") {
        setCbtPlan({ chapter, qids, baseTitle: title });
        return;
      }



      const res = await fetch("/api/quiz.php?action=createSubjectQuiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject,
          chapter_id: chapter.id,
          difficulty: difficulty !== "any" ? difficulty : "Medium",
          count: qids.length ? Math.min(qids.length, 30) : 15,
          qids: qids.length ? qids : undefined,
          title,
        }),
      });
      const data = await res.json();
      if (data.test_id) {
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode } as never });
      } else {
        toast.error(data.error || "Could not launch quiz");
      }
    } finally {
      setLaunching(null);
    }
  };

  const meta = META[subject] ?? META.Physics;
  const Icon = meta.icon;
  const filtersActive = difficulty !== "any" || qtype !== "any" || excluded.size > 0;

  return (
    <PageShell>
      <HubHero
        variant="banner"
        compact
        eyebrow="Subject"
        title={subject}
        highlight="Chapter practice"
        description={meta.blurb}
        Icon={Icon}
        accent={meta.accent}
        image={meta.image}
        imageAlt={meta.alt}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur">
          <Icon className="h-3 w-3" strokeWidth={2.2} />
          {chapters?.length ?? 0} chapters
        </span>
      </HubHero>

      {/* Consolidated, single-row compact filter bar */}
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-2 py-1.5 shadow-sm backdrop-blur-xl">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="h-8 min-w-0 flex-1 rounded-lg border-0 bg-secondary/60 px-2 text-xs">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any difficulty</SelectItem>
            {DIFFICULTIES.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={qtype} onValueChange={setQType}>
          <SelectTrigger className="h-8 min-w-0 flex-1 rounded-lg border-0 bg-secondary/60 px-2 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any type</SelectItem>
            {QTYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-[11px]"
            onClick={() => { setDifficulty("any"); setQType("any"); setExcluded(new Set()); }}
          >
            Reset
          </Button>
        )}
      </div>

      {filtersActive && excluded.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{topicStats.selected}/{topicStats.total} topics</Badge>
        </div>
      )}


      {chapters === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : chapters.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No chapters yet.</CardContent></Card>
      ) : (
        <div className="space-y-2.5">
          {chapters.map((c, i) => {
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card shadow-sm transition hover:border-primary/40">
                <div className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="h-8 w-px bg-border" />
                  <button
                    onClick={() => setModePick(c)}
                    disabled={!c.q_count || launching === c.id}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <div className="text-sm font-semibold leading-tight">{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.q_count === undefined ? "Counting…" : `${c.q_count} Questions`}
                      {filtersActive && c.q_count !== undefined && " (filtered)"}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    aria-label={isOpen ? "Hide sub-topics" : "Choose sub-topics"}
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-primary"
                    disabled={!c.q_count || launching === c.id}
                    onClick={() => setModePick(c)}
                  >
                    {launching === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
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

      <QuizModePicker
        open={!!modePick}
        subtitle={modePick ? `${subject} · ${modePick.name}` : undefined}
        onClose={() => setModePick(null)}
        onPick={(m) => modePick && startChapter(modePick, m)}
        busy={!!launching}
      />

      <CbtSetPicker
        plan={cbtPlan}
        userId={user?.id ?? null}
        difficulty={difficulty}
        onClose={() => setCbtPlan(null)}
      />



      <div className="mt-6">
        <Button asChild variant="ghost">
          <Link to="/dashboard">← Back to dashboard</Link>
        </Button>
      </div>
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* CBT sets                                                            */
/* ------------------------------------------------------------------ */

// How many questions go into one CBT set. A chapter with 800 questions
// becomes 800 / SET_SIZE separate timed papers.
const CBT_SET_SIZE = 30;

type CbtPlan = { chapter: Chapter; qids: string[]; baseTitle: string };
type SetStatus = { attemptId: string; score: number | null; correct: number | null; total: number };

function setTitle(baseTitle: string, index: number, total: number) {
  return `${baseTitle} · CBT Set ${index + 1}/${total}`;
}

/**
 * Lets the student pick which chunk ("set") of a chapter to attempt in CBT
 * mode, and shows which sets they've already submitted. Each set is a normal
 * practice test, so its answers and score are saved on submit and appear in
 * the usual analysis page — same as subject-wise quiz mode.
 */
function CbtSetPicker({
  plan,
  userId,
  difficulty,
  onClose,
}: {
  plan: CbtPlan | null;
  userId: string | null;
  difficulty: string;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const [statuses, setStatuses] = useState<Record<number, SetStatus>>({});
  const [loadingSets, setLoadingSets] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);

  const totalSets = plan ? Math.max(1, Math.ceil(plan.qids.length / CBT_SET_SIZE)) : 0;

  useEffect(() => {
    if (!plan || !userId) return;
    setStatuses({});
    setLoadingSets(true);
    let cancelled = false;
    (async () => {
      const titles = Array.from({ length: totalSets }, (_, i) => setTitle(plan.baseTitle, i, totalSets));
      try {
        const res = await fetch("/api/quiz.php?action=getPracticeSetStatuses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ titles }),
        });
        const data = res.ok ? await res.json() : { statuses: {} };
        if (cancelled) return;
        const next: Record<number, SetStatus> = {};
        titles.forEach((title, idx) => {
          const row = (data.statuses ?? {})[title];
          if (!row) return;
          next[idx] = {
            attemptId: String(row.attempt_id),
            score: row.score == null ? null : Number(row.score),
            correct: row.correct_count == null ? null : Number(row.correct_count),
            total: Math.min(CBT_SET_SIZE, plan.qids.length - idx * CBT_SET_SIZE),
          };
        });
        setStatuses(next);
      } catch (e) {
        console.warn("set status load failed:", e);
      } finally {
        if (!cancelled) setLoadingSets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan?.baseTitle, userId, totalSets]);

  async function launchSet(index: number) {
    if (!plan || !userId || starting !== null) return;
    setStarting(index);
    try {
      const slice = plan.qids.slice(index * CBT_SET_SIZE, (index + 1) * CBT_SET_SIZE);
      const title = setTitle(plan.baseTitle, index, totalSets);
      const res = await fetch("/api/quiz.php?action=createSubjectQuiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: (plan.chapter as any).subject || "Physics",
          chapter_id: plan.chapter.id,
          title,
          qids: slice,
          difficulty: difficulty !== "any" ? difficulty : "Medium",
          count: slice.length,
        }),
      });
      const data = await res.json();
      if (data.test_id) {
        onClose();
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode: "cbt" } as never });
      } else {
        toast.error(data.error || "Could not start this set");
      }
    } finally {
      setStarting(null);
    }
  }

  const isMobile = useIsMobile();
  const title = "Choose a CBT set";
  const description = plan
    ? `${plan.qids.length} questions split into ${totalSets} timed sets of up to ${CBT_SET_SIZE}. Attempt one set at a time — your answers and score are saved when you submit.`
    : "";

  const body = loadingSets ? (
    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
  ) : (
    <div className="grid gap-2 py-2">
      {Array.from({ length: totalSets }, (_, i) => {
        const from = i * CBT_SET_SIZE + 1;
        const to = Math.min((i + 1) * CBT_SET_SIZE, plan?.qids.length ?? 0);
        const done = statuses[i];
        const isBusy = starting === i;
        return (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-3 transition",
              done ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/5" : "border-border bg-card",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">Set {i + 1} of {totalSets}</div>
                  {done && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Attempted
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Questions {from}–{to} · {to - from + 1} Qs · {Math.max(10, to - from + 1)} min
                </div>
                {done && (
                  <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    Scored {done.score ?? 0} · {done.correct ?? 0}/{done.total} correct
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {done ? (
                <>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link to="/analysis/$attemptId" params={{ attemptId: done.attemptId }}>
                      <Eye className="h-3.5 w-3.5" /> View answers
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={starting !== null}
                    onClick={() => launchSet(i)}
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Reattempt
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="ml-auto bg-gradient-primary"
                  disabled={starting !== null}
                  onClick={() => launchSet(i)}
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start set"}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={!!plan} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

