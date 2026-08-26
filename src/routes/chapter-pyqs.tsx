import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { HubHero } from "@/components/nav-tiles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Play,
  RotateCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/chapter-pyqs")({
  head: () => ({
    meta: [
      { title: "Chapter Wise PYQ — 10.2k+ NEET, JEE, AIIMS & AIPMT Questions | Neet Buddy" },
      {
        name: "description",
        content:
          "Practice 10.2k+ previous year questions arranged chapter wise from NEET, JEE, AIIMS, AIPMT, KCET, MHT CET and TS EAMCET in quiz mode or real CBT mode.",
      },
      { property: "og:title", content: "Chapter Wise PYQ — 10.2k+ Questions" },
      {
        property: "og:description",
        content:
          "Every previous year question sorted chapter wise across NEET, JEE, AIIMS, AIPMT and state exams. Attempt in quiz mode or CBT mode with full results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChapterPyqPage,
});

type ChapterRow = {
  chapter_id: number;
  subject_id: string;
  chapter_name: string;
  pyq_count: number;
  first_year: number | null;
  last_year: number | null;
};

type AttemptInfo = { attemptId: string; testId: string; status: string };

const SUBJECTS = [
  {
    id: "physics",
    label: "Physics",
    icon: "/illustrations/icon-physics.png",
    iconAlt: "3D atom icon for Physics",
    ring: "from-blue-500 to-indigo-600",
    soft: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    hover: "hover:border-blue-500/50",
  },
  {
    id: "chemistry",
    label: "Chemistry",
    icon: "/illustrations/icon-chemistry.png",
    iconAlt: "3D lab flasks icon for Chemistry",
    ring: "from-emerald-500 to-teal-600",
    soft: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    hover: "hover:border-emerald-500/50",
  },
  {
    id: "biology",
    label: "Biology",
    icon: "/illustrations/icon-biology.png",
    iconAlt: "3D leaf, DNA and microscope icon for Biology",
    ring: "from-rose-500 to-pink-600",
    soft: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
    hover: "hover:border-rose-500/50",
  },
] as const;

type SubjectDef = (typeof SUBJECTS)[number];

/** CBT papers stay attemptable: long chapters are split into fixed-size sets. */
const CBT_SET_SIZE = 50;

const titleFor = (chapter: string, setLabel?: string) =>
  `PYQ · ${chapter}${setLabel ? ` · ${setLabel}` : ""}`;

function ChapterPyqPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<ChapterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<SubjectDef | null>(null);
  const [query, setQuery] = useState("");
  const [launching, setLaunching] = useState<number | null>(null);
  const [modePick, setModePick] = useState<ChapterRow | null>(null);
  const [cbtPlan, setCbtPlan] = useState<{ chapter: ChapterRow; qids: string[] } | null>(null);
  /** chapter title prefix -> latest attempt, drives Reattempt / View solution. */
  const [attempts, setAttempts] = useState<Record<string, AttemptInfo>>({});

  useEffect(() => {
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from("qb_pyq_chapter_counts")
        .select("chapter_id,subject_id,chapter_name,pyq_count,first_year,last_year")
        .order("pyq_count", { ascending: false });
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as ChapterRow[]);
    })().catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!user) {
      setAttempts({});
      return;
    }
    (async () => {
      const { data: tests } = await supabase
        .from("tests")
        .select("id,title")
        .eq("created_by", user.id)
        .eq("source", "PYQ");
      const list = (tests ?? []) as Array<{ id: string; title: string }>;
      if (!list.length) return;
      const { data: att } = await supabase
        .from("attempts")
        .select("id,test_id,status")
        .eq("user_id", user.id)
        .in(
          "test_id",
          list.map((t) => t.id),
        )
        .order("started_at", { ascending: false });
      const byTest = new Map<string, { id: string; status: string }>();
      for (const a of (att ?? []) as Array<{ id: string; test_id: string; status: string }>) {
        if (!byTest.has(a.test_id)) byTest.set(a.test_id, { id: a.id, status: a.status });
      }
      const map: Record<string, AttemptInfo> = {};
      for (const t of list) {
        const a = byTest.get(t.id);
        if (!a) continue;
        const chapter = t.title.replace(/^PYQ · /, "").split(" · Set ")[0];
        if (!map[chapter]) map[chapter] = { attemptId: a.id, testId: t.id, status: a.status };
      }
      setAttempts(map);
    })().catch(() => {});
  }, [user]);

  const totals = useMemo(() => {
    const t: Record<string, { chapters: number; questions: number }> = {};
    for (const r of rows ?? []) {
      const cur = (t[r.subject_id] ??= { chapters: 0, questions: 0 });
      cur.chapters += 1;
      cur.questions += r.pyq_count ?? 0;
    }
    return t;
  }, [rows]);

  const grandTotal = useMemo(
    () => Object.values(totals).reduce((s, v) => s + v.questions, 0),
    [totals],
  );

  const visible = useMemo(() => {
    if (!subject) return [];
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => r.subject_id === subject.id)
      .filter((r) => (q ? r.chapter_name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.chapter_name.localeCompare(b.chapter_name));
  }, [rows, subject, query]);

  async function fetchPyqIds(chapterId: number) {
    const { data, error: err } = await (supabase as any)
      .from("questions")
      .select("id,year")
      .eq("chapter_id", String(chapterId))
      .eq("is_pyq", true)
      .order("year", { ascending: false })
      .limit(2000);
    if (err) throw new Error(err.message);
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  async function launch(chapter: ChapterRow, mode: QuizMode, qids: string[], setLabel?: string) {
    if (!user) {
      toast.error("Log in to start a PYQ session.");
      return;
    }
    const title = titleFor(chapter.chapter_name, setLabel);
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
      const { error: uErr } = await supabase
        .from("tests")
        .update({ question_ids: qids, total_questions: qids.length })
        .eq("id", existing.id);
      if (uErr) {
        toast.error(uErr.message);
        return;
      }
      nav({ to: "/quiz/$testId", params: { testId: existing.id }, search: { mode } as never });
      return;
    }

    const { data: t, error: iErr } = await supabase
      .from("tests")
      .insert({
        title,
        type: "practice",
        difficulty: "medium",
        duration_min: Math.round(Math.max(10, Math.min(180, qids.length * 1.2))),
        total_questions: qids.length,
        question_ids: qids,
        created_by: user.id,
        source: "PYQ",
      })
      .select("id")
      .maybeSingle();
    if (iErr || !t) {
      toast.error(iErr?.message ?? "Could not start this PYQ set.");
      return;
    }
    nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
  }

  async function start(chapter: ChapterRow, mode: QuizMode) {
    setModePick(null);
    setLaunching(chapter.chapter_id);
    try {
      const qids = await fetchPyqIds(chapter.chapter_id);
      if (!qids.length) {
        toast.error("No PYQs found for this chapter yet.");
        return;
      }
      if (mode === "cbt" && qids.length > CBT_SET_SIZE) {
        setCbtPlan({ chapter, qids });
        return;
      }
      await launch(chapter, mode, qids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start this PYQ set.");
    } finally {
      setLaunching(null);
    }
  }

  return (
    <PageShell>
      <HubHero
        variant="banner"
        compact
        hideEyebrow
        eyebrow="Previous Years · Chapter wise"
        title="Chapter Wise PYQ"
        highlight={`${grandTotal ? (grandTotal / 1000).toFixed(1) : "10.2"}k questions`}
        description="NEET · JEE · AIIMS · AIPMT + state exams. Pick a chapter, choose quiz or CBT mode."
        Icon={BookMarked}
        image="/illustrations/hero-pyq.png"
        imageAlt="3D icon of previous year question papers"
        accent="violet"
      />

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {rows === null && !error && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading chapters…
        </div>
      )}

      {/* ---------- Step 1: subjects ---------- */}
      {rows !== null && !error && !subject && (
        <section className="grid gap-3 sm:grid-cols-3">
          {SUBJECTS.map((s) => {
            const t = totals[s.id] ?? { chapters: 0, questions: 0 };
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSubject(s);
                  setQuery("");
                }}
                className={`group flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant ${s.hover}`}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${s.ring} shadow-sm`}
                >
                  <img
                    src={s.icon}
                    alt={s.iconAlt}
                    loading="lazy"
                    className="h-8 w-8 object-contain drop-shadow"
                  />
                </span>
                <span className="block text-base font-bold">{s.label}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${s.soft}`}>
                    {t.questions} PYQs
                  </span>
                  <span>{t.chapters} chapters</span>
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                  Browse chapters <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </section>
      )}

      {/* ---------- Step 2: chapters ---------- */}
      {rows !== null && !error && subject && (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSubject(null)}>
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Subjects
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate text-lg font-bold leading-tight">
                <img
                  src={subject.icon}
                  alt={subject.iconAlt}
                  className="h-6 w-6 shrink-0 object-contain"
                />
                {subject.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {(totals[subject.id]?.questions ?? 0).toLocaleString()} previous year questions
              </div>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chapters"
                className="w-full rounded-full border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/60"
              />
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {visible.length}
            </span>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((c, i) => {
              const at = attempts[c.chapter_name];
              const busy = launching === c.chapter_id;
              return (
                <li key={c.chapter_id}>
                  <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-elegant">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${subject.soft}`}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[15px] font-bold leading-snug">{c.chapter_name}</h2>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="secondary" className="text-[10px]">
                              {c.pyq_count} PYQ
                            </Badge>
                            {c.first_year && c.last_year && (
                              <span>
                                {c.first_year}–{c.last_year}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {at?.status === "completed" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              disabled={busy}
                              onClick={() => setModePick(c)}
                            >
                              {busy ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Reattempt
                            </Button>
                            <Button asChild size="sm" className="flex-1 bg-gradient-primary">
                              <Link to="/analysis/$attemptId" params={{ attemptId: at.attemptId }}>
                                <Eye className="mr-1.5 h-3.5 w-3.5" /> View solution
                              </Link>
                            </Button>
                          </>
                        ) : at?.status === "in_progress" ? (
                          <Button
                            asChild
                            size="sm"
                            className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
                          >
                            <Link
                              to="/quiz/$testId"
                              params={{ testId: at.testId }}
                              search={{ mode: "quiz" } as never}
                            >
                              <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Resume
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-primary"
                            disabled={busy}
                            onClick={() => setModePick(c)}
                          >
                            {busy ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Start practice
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
            {!visible.length && (
              <li className="sm:col-span-2">
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No chapters match this search.
                  </CardContent>
                </Card>
              </li>
            )}
          </ul>
        </section>
      )}

      <QuizModePicker
        open={!!modePick}
        subtitle={
          modePick ? `${modePick.chapter_name} · ${modePick.pyq_count} previous year questions` : undefined
        }
        onClose={() => setModePick(null)}
        onPick={(m) => modePick && start(modePick, m)}
        busy={launching !== null}
      />

      <Dialog open={!!cbtPlan} onOpenChange={(o) => !o && setCbtPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cbtPlan?.chapter.chapter_name}</DialogTitle>
            <DialogDescription>
              {cbtPlan?.qids.length} PYQs in this chapter. Pick a set of {CBT_SET_SIZE} to attempt as
              a timed CBT paper.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {cbtPlan &&
              Array.from({ length: Math.ceil(cbtPlan.qids.length / CBT_SET_SIZE) }).map((_, i) => {
                const slice = cbtPlan.qids.slice(i * CBT_SET_SIZE, (i + 1) * CBT_SET_SIZE);
                return (
                  <Button
                    key={i}
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const plan = cbtPlan;
                      setCbtPlan(null);
                      await launch(plan.chapter, "cbt", slice, `Set ${i + 1}`);
                    }}
                  >
                    Set {i + 1} · {slice.length}Q
                  </Button>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
