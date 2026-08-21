import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, Play, Atom, FlaskConical, Leaf, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const pageSize = 1000;

  const runQuery = async (scope: "all" | "topics" | "subtopics") => {
    const rows: MixableQuestion[] = [];
    for (let from = 0; ; from += pageSize) {
      // Cast: the generated types predate the qb_* compatibility view, which
      // also exposes qtype / question_image_url / topic_id / subtopic_id.
      let q: any = (supabase as any)
        .from("questions")
        .select("id,text,qtype,question_image_url")
        .eq("chapter_id", chapterId);
      if (filters.difficulty !== "any") q = q.eq("difficulty", filters.difficulty);
      if (filters.qtype !== "any") q = q.eq("qtype", filters.qtype);
      if (scope === "topics") q = q.in("topic_id", topicFilter.fullTopicIds);
      if (scope === "subtopics") q = q.in("subtopic_id", topicFilter.subtopicIds);
      // `created_at` is NULL in the compatibility view, so order by id.
      const { data, error } = await q.order("id", { ascending: true }).range(from, from + pageSize - 1);
      if (error) break;
      const batch = (data ?? []) as unknown as MixableQuestion[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
    return rows;
  };

  if (topicFilter.everything) return runQuery("all");

  const parts: MixableQuestion[] = [];
  if (topicFilter.fullTopicIds.length) parts.push(...(await runQuery("topics")));
  if (topicFilter.subtopicIds.length) parts.push(...(await runQuery("subtopics")));
  const seen = new Set<string>();
  return parts.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
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

  useEffect(() => {
    (async () => {
      const { data: subj } = await supabase.from("subjects").select("id").eq("name", subject).maybeSingle();
      if (!subj) return setChapters([]);
      const { data: chs } = await supabase
        .from("chapters")
        .select("id,name,order_index")
        .eq("subject_id", subj.id)
        .order("order_index");
      const list = (chs ?? []) as Chapter[];
      setChapters(list.map((c) => ({ ...c, q_count: undefined })));
    })();
  }, [subject]);

  // Recount matching questions per chapter whenever the difficulty / qtype
  // filters change so the card shows the true pool size the user will draw
  // from — not the raw chapter total.
  useEffect(() => {
    if (!chapters || chapters.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        chapters.map(async (c) => {
          let q: any = supabase
            .from("questions")
            .select("id", { count: "exact", head: true })
            .eq("chapter_id", c.id);
          if (difficulty !== "any") q = q.eq("difficulty", difficulty);
          if (qtype !== "any") q = q.eq("qtype", qtype);
          const { count } = await q;
          return [c.id, count ?? 0] as const;
        }),
      );
      if (cancelled) return;
      const map = Object.fromEntries(results);
      setChapters((prev) => prev?.map((c) => ({ ...c, q_count: map[c.id] ?? 0 })) ?? prev);
    })();
    return () => { cancelled = true; };
  }, [chapters?.length, difficulty, qtype]);


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



      const { data: existing } = await supabase
        .from("tests")
        .select("id")
        .eq("created_by", user.id)
        .eq("title", title)
        .eq("type", "practice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("tests")
          .update({ question_ids: qids, total_questions: qids.length })
          .eq("id", existing.id);
        if (error) return toast.error(error.message);
        nav({ to: "/quiz/$testId", params: { testId: existing.id }, search: { mode } as never });
        return;
      }

      const { data: t, error } = await supabase
        .from("tests")
        .insert({
          title,
          type: "practice",
          difficulty: difficulty === "any" ? "medium" : difficulty.toLowerCase(),
          duration_min: Math.round(Math.max(10, Math.min(180, qids.length * 1.5))),
          total_questions: qids.length,
          question_ids: qids,
          created_by: user.id,
          source: "NCERT",
        })
        .select("id")
        .maybeSingle();
      if (error || !t) return toast.error(error?.message ?? "Could not start");
      nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
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
        eyebrow="Subject"
        title={subject}
        highlight="Chapter practice"
        description={meta.blurb}
        Icon={Icon}
        accent={meta.accent}
        image={meta.image}
        imageAlt={meta.alt}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
          <Icon className="h-4 w-4" strokeWidth={2.2} />
          {chapters?.length ?? 0} chapters
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
          NEET 2027 syllabus
        </span>
      </HubHero>

      <div className="mb-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-soft backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Filters</span>
          {filtersActive && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 px-2 text-xs"
              onClick={() => { setDifficulty("any"); setQType("any"); setExcluded(new Set()); }}
            >
              Reset
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any difficulty</SelectItem>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Question type</Label>
            <Select value={qtype} onValueChange={setQType}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any type</SelectItem>
                {QTYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>


      {filtersActive && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1"><SlidersHorizontal className="h-3 w-3" /> Filters on</Badge>
          {difficulty !== "any" && <Badge variant="outline">{difficulty}</Badge>}
          {qtype !== "any" && <Badge variant="outline">{qtype}</Badge>}
          {excluded.size > 0 && <Badge variant="outline">{topicStats.selected}/{topicStats.total} topics</Badge>}
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
    (async () => {
      const titles = Array.from({ length: totalSets }, (_, i) => setTitle(plan.baseTitle, i, totalSets));
      const { data: tests } = await supabase
        .from("tests")
        .select("id,title")
        .eq("created_by", userId)
        .eq("type", "practice")
        .in("title", titles);
      const byId = new Map<string, string>((tests ?? []).map((t) => [t.id as string, t.title as string]));
      if (byId.size) {
        const { data: attempts } = await supabase
          .from("attempts")
          .select("id,test_id,score,correct_count,submitted_at")
          .eq("user_id", userId)
          .eq("status", "completed")
          .in("test_id", Array.from(byId.keys()))
          .order("submitted_at", { ascending: false });
        const next: Record<number, SetStatus> = {};
        for (const a of attempts ?? []) {
          const title = byId.get(a.test_id as string);
          const idx = titles.indexOf(title ?? "");
          if (idx < 0 || next[idx]) continue;
          next[idx] = {
            attemptId: a.id as string,
            score: (a.score as number | null) ?? null,
            correct: (a.correct_count as number | null) ?? null,
            total: Math.min(CBT_SET_SIZE, plan.qids.length - idx * CBT_SET_SIZE),
          };
        }
        setStatuses(next);
      }
      setLoadingSets(false);
    })();
  }, [plan?.baseTitle, userId, totalSets]);

  async function launchSet(index: number) {
    if (!plan || !userId || starting !== null) return;
    setStarting(index);
    try {
      const slice = plan.qids.slice(index * CBT_SET_SIZE, (index + 1) * CBT_SET_SIZE);
      const title = setTitle(plan.baseTitle, index, totalSets);
      const { data: existing } = await supabase
        .from("tests")
        .select("id")
        .eq("created_by", userId)
        .eq("title", title)
        .eq("type", "practice")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let testId = existing?.id as string | undefined;
      if (testId) {
        const { error } = await supabase
          .from("tests")
          .update({ question_ids: slice, total_questions: slice.length })
          .eq("id", testId);
        if (error) return toast.error(error.message);
      } else {
        const { data: t, error } = await supabase
          .from("tests")
          .insert({
            title,
            type: "practice",
            difficulty: difficulty === "any" ? "medium" : difficulty.toLowerCase(),
            // NTA pace: roughly a minute per question.
            duration_min: Math.max(10, slice.length),
            total_questions: slice.length,
            question_ids: slice,
            created_by: userId,
            source: "NCERT",
          })
          .select("id")
          .maybeSingle();
        if (error || !t) return toast.error(error?.message ?? "Could not start this set");
        testId = t.id as string;
      }
      onClose();
      nav({ to: "/quiz/$testId", params: { testId: testId! }, search: { mode: "cbt" } as never });
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

