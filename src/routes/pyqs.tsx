import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { HubHero } from "@/components/nav-tiles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookMarked, ArrowLeft, CheckCircle2, XCircle, Clock, Bookmark, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { PyqRichText } from "@/components/pyq-rich-text";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/pyqs")({
  head: () => ({
    meta: [
      { title: "NEET PYQ Full Papers — CBT Mock Mode | Neet Buddy" },
      {
        name: "description",
        content:
          "Attempt every NEET previous year paper (2002–2025) in real NTA CBT mode with question palette, timer, and detailed result analysis.",
      },
      { property: "og:title", content: "NEET PYQ Full Papers — CBT Mode" },
      {
        property: "og:description",
        content:
          "37 full NEET papers · 6000+ questions · NTA CBT interface with grid palette, review, and analysis.",
      },
    ],
  }),
  component: PyqPage,
  errorComponent: ({ error, reset }) => (
    <PageShell title="NEET PYQs" description="Something went wrong loading this page.">
      <Card>
        <CardContent className="p-6 text-sm">
          <div className="mb-3 font-semibold text-destructive">Error</div>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
            {String(error?.message ?? error)}
          </pre>
          <Button className="mt-4" onClick={() => reset()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  ),
});

// ---------------- Types ----------------

type Paper = {
  id: string;
  ext_id: string;
  title: string;
  year: number;
  total_questions: number;
  duration_minutes: number;
};

type Option = { key: string; text: string; image?: string | null };
type PYQ = {
  id: string;
  question_no: number | null;
  year: number;
  subject: string;
  chapter: string;
  text: string;
  options: Option[];
  correct: string[];
  explanation: string;
};

const SUBJECT_COLORS: Record<string, string> = {
  Physics: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  Chemistry: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Biology: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

// palette question states
type QState = "notVisited" | "notAnswered" | "answered" | "review" | "answeredReview";

// ---------------- Page ----------------

function PyqPage() {
  const [activePaper, setActivePaper] = useState<Paper | null>(null);


  if (activePaper) {
    return <PyqCbtRunner paper={activePaper} onExit={() => setActivePaper(null)} />;
  }

  return (
    <PageShell>
      <HubHero
        variant="banner"
        compact
        eyebrow="Previous Years · CBT Mode"
        title="NEET PYQ"
        highlight="Full Papers"
        description="Every NEET paper from 2002–2025 in a real NTA computer-based test interface — grid palette, timer, mark for review and full analysis."
        Icon={BookMarked}
        accent="violet"
        image="/illustrations/hero-pyq.png"
        imageAlt="NEET PYQ clipboard with books, pen and trophy"
      />
      <PaperList onPick={setActivePaper} />
    </PageShell>
  );
}

// ---------------- Paper list ----------------

type PyqAttempt = { id: string; score: number | null; submitted_at: string };

function PaperList({ onPick }: { onPick: (p: Paper) => void }) {
  const { user } = useAuth();
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | "All">("All");
  const [attempted, setAttempted] = useState<Record<string, PyqAttempt>>({});

  useEffect(() => {
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from("neet_pyq_papers")
        .select("id,ext_id,title,year,total_questions,duration_minutes")
        .order("year", { ascending: false })
        .order("title");
      if (err) {
        setError(err.message);
        setPapers([]);
        return;
      }
      setPapers((data ?? []) as unknown as Paper[]);
    })();
  }, []);

  // Latest attempt per paper → drives "Attempt" vs "Reattempt + View result".
  useEffect(() => {
    if (!user) { setAttempted({}); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("neet_pyq_attempts")
        .select("id,paper_id,score,submitted_at")
        .eq("user_id", user.id)
        .order("submitted_at", { ascending: false });
      const map: Record<string, PyqAttempt> = {};
      for (const r of (data ?? []) as Array<PyqAttempt & { paper_id: string }>) {
        if (!map[r.paper_id]) map[r.paper_id] = { id: r.id, score: r.score, submitted_at: r.submitted_at };
      }
      setAttempted(map);
    })().catch(() => {});
  }, [user]);


  if (papers === null) return <LoadingBlock />;
  if (error) return <EmptyBlock label={error} />;
  if (!papers.length) return <EmptyBlock label="No PYQ papers available yet." />;

  const years = Array.from(new Set(papers.map((p) => p.year))).sort((a, b) => b - a);
  const filtered = yearFilter === "All" ? papers : papers.filter((p) => p.year === yearFilter);

  // group by year for cleaner scan
  const grouped = new Map<number, Paper[]>();
  for (const p of filtered) {
    if (!grouped.has(p.year)) grouped.set(p.year, []);
    grouped.get(p.year)!.push(p);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <FilterChip active={yearFilter === "All"} onClick={() => setYearFilter("All")}>
          All years
        </FilterChip>
        {years.map((y) => (
          <FilterChip key={y} active={yearFilter === y} onClick={() => setYearFilter(y)}>
            {y}
          </FilterChip>
        ))}
      </div>

      <div className="space-y-8">
        {[...grouped.entries()].map(([year, ps]) => (
          <div key={year}>
            <div className="mb-3 flex items-center gap-3">
              <div className="text-xl font-bold tracking-tight">NEET {year}</div>
              <div className="text-xs text-muted-foreground">
                {ps.length} paper{ps.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ps.map((p) => {
                const at = attempted[p.id];
                return (
                <div
                  key={p.id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                  <div className="relative flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                      <BookMarked className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-bold leading-tight">{p.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{p.total_questions} Qs</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {p.duration_minutes} min
                        </span>
                        <span>+4 / -1</span>
                      </div>
                    </div>
                    {at && (
                      <Badge className="bg-success/15 text-success">
                        {at.score !== null ? `${at.score}` : "Done"}
                      </Badge>
                    )}
                  </div>
                  <div className="relative mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant={at ? "outline" : "default"}
                      className={at ? "flex-1" : "flex-1 bg-gradient-primary"}
                      onClick={() => onPick(p)}
                    >
                      {at ? "Reattempt" : "Attempt paper"}
                    </Button>
                    {at && (
                      <Button asChild size="sm" className="flex-1 bg-gradient-primary">
                        <Link to="/pyqs/result/$attemptId" params={{ attemptId: at.id }}>
                          View result
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
                );
              })}

            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function LoadingBlock() {
  return (
    <LoadingScreen variant="quiz" fullScreen={false} />
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  );
}

// ---------------- CBT Runner ----------------

type Response = { answer?: string; visited: boolean; markedForReview: boolean };

function PyqCbtRunner({ paper, onExit }: { paper: Paper; onExit: () => void }) {
  const [questions, setQuestions] = useState<PYQ[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<number, Response>>({});
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [reviewIdx, setReviewIdx] = useState<number | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>("All");
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(paper.duration_minutes * 60);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const startRef = useRef<number>(Date.now());

  // Load questions
  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await (supabase as any)
          .from("neet_pyq_questions")
          .select("id,question_no,year,subject,chapter,text,options,correct,explanation")
          .eq("paper_id", paper.id)
          .order("question_no", { ascending: true })
          .limit(500);
        if (err) throw err;
        const rows = ((data ?? []) as unknown) as PYQ[];
        setQuestions(rows);
        // Mark first as visited
        if (rows.length)
          setResponses({ 0: { visited: true, markedForReview: false } });
      } catch (e: any) {
        setError(e?.message ?? "Failed to load questions");
        setQuestions([]);
      }
    })();
  }, [paper.id]);

  // Timer
  useEffect(() => {
    if (submitted || !questions?.length) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setSubmitted(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [submitted, questions]);

  // Mark visited on current change
  useEffect(() => {
    if (!questions) return;
    setResponses((r) => {
      if (r[current]?.visited) return r;
      return { ...r, [current]: { ...(r[current] ?? { markedForReview: false }), visited: true } };
    });
  }, [current, questions]);

  const setAnswer = (idx: number, key: string | undefined) => {
    setResponses((r) => ({
      ...r,
      [idx]: {
        ...(r[idx] ?? { visited: true, markedForReview: false }),
        answer: key,
      },
    }));
  };
  const toggleReview = (idx: number) => {
    setResponses((r) => ({
      ...r,
      [idx]: {
        ...(r[idx] ?? { visited: true, markedForReview: false }),
        markedForReview: !(r[idx]?.markedForReview),
      },
    }));
  };

  const state = (idx: number): QState => {
    const r = responses[idx];
    if (!r || !r.visited) return "notVisited";
    if (r.markedForReview && r.answer) return "answeredReview";
    if (r.markedForReview) return "review";
    if (r.answer) return "answered";
    return "notAnswered";
  };

  // Score
  const score = useMemo(() => {
    if (!questions) return { correct: 0, wrong: 0, unattempted: 0, marks: 0 };
    let correct = 0,
      wrong = 0,
      unattempted = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const a = responses[i]?.answer;
      if (!a) {
        unattempted++;
        continue;
      }
      const isC = (q.correct ?? []).map((c) => c.toUpperCase()).includes(a.toUpperCase());
      if (isC) correct++;
      else wrong++;
    }
    return {
      correct,
      wrong,
      unattempted,
      marks: correct * 4 - wrong * 1,
    };
  }, [responses, questions]);

  // Save attempt on submit
  useEffect(() => {
    if (!submitted || !questions?.length) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const respMap: Record<string, string> = {};
      for (let i = 0; i < questions.length; i++) {
        const a = responses[i]?.answer;
        if (a) respMap[questions[i].id] = a;
      }
      const { data: inserted } = await (supabase as any).from("neet_pyq_attempts").insert({
        user_id: user.id,
        paper_id: paper.id,
        responses: respMap,
        score: score.marks,
        correct_count: score.correct,
        wrong_count: score.wrong,
        skipped_count: score.unattempted,
        time_spent_sec: Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)),
      }).select("id").maybeSingle();
      if (inserted?.id) setSavedAttemptId(inserted.id as string);
    })();
  }, [submitted, questions, responses, score, paper.id]);

  if (questions === null) {
    return (
      <PageShell eyebrow={paper.title} title="Loading paper...">
        <LoadingBlock />
      </PageShell>
    );
  }
  if (error) {
    return (
      <PageShell eyebrow={paper.title} title="Error">
        <BackBtn onClick={onExit} />
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageShell>
    );
  }
  if (!questions.length) {
    return (
      <PageShell eyebrow={paper.title} title="No questions">
        <BackBtn onClick={onExit} />
        <EmptyBlock label="No questions found for this paper." />
      </PageShell>
    );
  }

  // ---- Review (read-only, with correct answers) ----
  if (submitted && reviewIdx !== null) {
    const q = questions[reviewIdx];
    return (
      <PageShell eyebrow={paper.title} title={`Review — Q${reviewIdx + 1}`}>
        <button
          onClick={() => setReviewIdx(null)}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to result
        </button>
        <QuestionReview q={q} picked={responses[reviewIdx]?.answer} />
        <div className="mt-4 flex justify-between">
          <Button
            variant="outline"
            disabled={reviewIdx === 0}
            onClick={() => setReviewIdx(reviewIdx - 1)}
          >
            Previous
          </Button>
          <Button
            disabled={reviewIdx >= questions.length - 1}
            onClick={() => setReviewIdx(reviewIdx + 1)}
          >
            Next
          </Button>
        </div>
      </PageShell>
    );
  }

  // ---- Result screen ----
  if (submitted) {
    const total = questions.length;
    const maxMarks = total * 4;
    const acc = score.correct + score.wrong > 0
      ? Math.round((score.correct / (score.correct + score.wrong)) * 100)
      : 0;
    // subject-wise breakdown
    const bySubject = new Map<string, { c: number; w: number; s: number }>();
    questions.forEach((q, i) => {
      const bucket = bySubject.get(q.subject) ?? { c: 0, w: 0, s: 0 };
      const a = responses[i]?.answer;
      if (!a) bucket.s++;
      else if ((q.correct ?? []).map((c) => c.toUpperCase()).includes(a.toUpperCase())) bucket.c++;
      else bucket.w++;
      bySubject.set(q.subject, bucket);
    });

    return (
      <PageShell eyebrow="Result" title={`${paper.title}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <BackBtn onClick={onExit} label="Back to papers" />
          {savedAttemptId && (
            <Link
              to="/pyqs/result/$attemptId"
              params={{ attemptId: savedAttemptId }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              Open detailed analysis →
            </Link>
          )}
        </div>


        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Score"
            value={`${score.marks} / ${maxMarks}`}
            tone="primary"
          />
          <StatCard label="Accuracy" value={`${acc}%`} tone="primary" />
          <StatCard label="Correct" value={score.correct} tone="success" />
          <StatCard label="Wrong" value={score.wrong} tone="danger" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="p-5">
              <div className="mb-3 text-sm font-semibold text-muted-foreground">
                Question navigator — tap to review
              </div>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
                {questions.map((q, i) => {
                  const a = responses[i]?.answer;
                  const st = !a
                    ? "skip"
                    : (q.correct ?? []).map((c) => c.toUpperCase()).includes(a.toUpperCase())
                      ? "ok"
                      : "bad";
                  return (
                    <button
                      key={q.id}
                      onClick={() => setReviewIdx(i)}
                      className={cn(
                        "h-9 rounded-md border text-xs font-semibold transition-transform hover:-translate-y-0.5",
                        st === "ok" &&
                          "border-emerald-500 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
                        st === "bad" &&
                          "border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-200",
                        st === "skip" && "border-border bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <LegendDot cls="bg-emerald-500/20 border-emerald-500" label="Correct" />
                <LegendDot cls="bg-rose-500/20 border-rose-500" label="Wrong" />
                <LegendDot cls="bg-muted border-border" label="Skipped" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-3 text-sm font-semibold text-muted-foreground">
                Subject-wise breakdown
              </div>
              <div className="space-y-3">
                {[...bySubject.entries()].map(([subj, b]) => (
                  <div key={subj} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <Badge className={cn("border-0", SUBJECT_COLORS[subj])}>{subj}</Badge>
                      <div className="text-xs text-muted-foreground">
                        {b.c + b.w + b.s} Qs
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs">
                      <span className="text-emerald-600">✓ {b.c}</span>
                      <span className="text-rose-600">✗ {b.w}</span>
                      <span className="text-muted-foreground">— {b.s}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  // ---- Test-taking screen (NTA CBT) ----
  const q = questions[current];
  const picked = responses[current]?.answer;

  // filter visible palette by subject
  const paletteIndices = questions
    .map((qq, i) => ({ qq, i }))
    .filter(({ qq }) => subjectFilter === "All" || qq.subject === subjectFilter);

  const subjects = Array.from(new Set(questions.map((qq) => qq.subject)));
  const answeredCount = Object.values(responses).filter((r) => r?.answer).length;

  const goSaveNext = () => {
    if (current < questions.length - 1) setCurrent(current + 1);
  };
  const markReviewNext = () => {
    toggleReview(current);
    if (current < questions.length - 1) setCurrent(current + 1);
  };
  const clearResponse = () => setAnswer(current, undefined);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const timeCritical = secondsLeft < 300;

  // ---- NTA-style CBT UI (matches Neet Buddy CBT screenshots) ----
  const paletteBg = (st: QState) => {
    switch (st) {
      case "answered": return "bg-emerald-500 text-white border-emerald-600";
      case "notAnswered": return "bg-orange-500 text-white border-orange-600";
      case "review": return "bg-blue-500 text-white border-blue-600";
      case "answeredReview": return "bg-blue-500 text-white border-blue-600";
      default: return "bg-slate-200 text-slate-800 border-slate-300";
    }
  };
  const counts = {
    notVisited: questions.filter((_, i) => state(i) === "notVisited").length,
    notAnswered: questions.filter((_, i) => state(i) === "notAnswered").length,
    answered: questions.filter((_, i) => state(i) === "answered").length,
    review: questions.filter((_, i) => state(i) === "review").length,
    answeredReview: questions.filter((_, i) => state(i) === "answeredReview").length,
  };
  const currentPicked = picked ?? undefined;
  const clearAnswer = () => setAnswer(current, undefined);
  const saveAndNext = () => { if (current < questions.length - 1) setCurrent(current + 1); };
  const saveAndMark = () => {
    if (!responses[current]?.markedForReview) toggleReview(current);
  };
  const markAndNext = () => {
    if (!responses[current]?.markedForReview) toggleReview(current);
    if (current < questions.length - 1) setCurrent(current + 1);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Candidate strip */}
      <div className="border-b border-slate-300 bg-white px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-500">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
              </svg>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] sm:text-sm">
              <span className="text-slate-500">Candidate Name</span>
              <span className="font-semibold text-orange-600">: Candidate</span>
              <span className="text-slate-500">Exam Name</span>
              <span className="font-semibold text-orange-600">: {paper.title}</span>
              <span className="text-slate-500">Subject</span>
              <span className="font-semibold text-orange-600">: {q.subject}</span>
            </div>
          </div>
          <Button onClick={onExit} variant="ghost" size="sm" className="text-slate-500 hover:text-slate-800">Exit</Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-6 lg:grid lg:grid-cols-[1fr_340px] lg:gap-4">
        {/* -------- LEFT: Question column -------- */}
        <div className="min-w-0">
        <div className="rounded border border-slate-300 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-orange-500 px-4 py-2 text-white">
            <div className="text-base font-bold sm:text-lg">Question {current + 1}:</div>
            <div className="flex items-center gap-2 lg:hidden">
              <span className="text-xs font-semibold sm:text-sm">Time:</span>
              <span className="rounded bg-white px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-orange-600 sm:text-sm">
                {mm}:{ss}
              </span>
            </div>
          </div>

          <div className="space-y-4 px-4 py-5 sm:px-6">
            <div className="text-[15px] leading-relaxed text-slate-900 sm:text-base">
              <PyqRichText html={q.text} />
            </div>
            <div className="space-y-2">
              {(q.options ?? []).map((opt, i) => (
                <div key={opt.key} className="flex gap-2 text-[15px] leading-relaxed text-slate-900">
                  <span className="shrink-0 font-semibold">({i + 1})</span>
                  <div className="flex-1">
                    <PyqRichText html={opt.text} />
                    {opt.image && (
                      <img src={opt.image} alt="" loading="lazy" className="mt-2 max-h-48 rounded border border-slate-200 object-contain" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-4 gap-3">
              {(q.options ?? []).map((opt, i) => {
                const key = opt.key.toUpperCase();
                const selected = currentPicked === key;
                return (
                  <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="radio"
                      name={`pyq-opt-${q.id}`}
                      checked={selected}
                      onChange={() => setAnswer(current, key)}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span>{i + 1} )</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button onClick={saveAndNext} className="rounded bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-emerald-600 sm:text-sm">Save &amp; Next</button>
          <button onClick={clearAnswer} className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 sm:text-sm">Clear</button>
          <button onClick={saveAndMark} className="rounded bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-amber-500 sm:text-sm">Save &amp; Mark for Review</button>
          <button onClick={markAndNext} className="rounded bg-blue-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-blue-600 sm:text-sm">Mark for Review &amp; Next</button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button disabled={current === 0} onClick={() => setCurrent(current - 1)} className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:text-sm">&lt;&lt; Back</button>
          <button disabled={current >= questions.length - 1} onClick={() => setCurrent(current + 1)} className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:text-sm">Next &gt;&gt;</button>
          <button onClick={() => setConfirmingSubmit(true)} className="ml-auto rounded bg-emerald-500 px-6 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-emerald-600 sm:text-sm">Submit</button>
        </div>

        {/* Mobile-only legend + palette (hidden on desktop where sidebar shows them) */}
        <div className="mt-4 rounded border border-dashed border-slate-400 bg-white px-3 py-3 lg:hidden">
          <div className="grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-5 sm:text-sm">
            <PyqLegend count={counts.notVisited} label="Not Visited" swatch="bg-slate-300 text-slate-800" />
            <PyqLegend count={counts.notAnswered} label="Not Answered" swatch="bg-orange-500 text-white" />
            <PyqLegend count={counts.answered} label="Answered" swatch="bg-emerald-500 text-white" />
            <PyqLegend count={counts.review} label="Marked" swatch="bg-blue-500 text-white" />
            <PyqLegend count={counts.answeredReview} label="Marked & Ans" swatch="bg-blue-500 text-white" dot />
          </div>
        </div>

        <div className="mt-4 rounded border border-slate-300 bg-white p-3 lg:hidden">
          <div className="flex flex-wrap gap-1.5">
            {questions.map((qq, i) => {
              const st = state(i);
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-sm border text-sm font-bold transition",
                    paletteBg(st),
                    i === current && "ring-2 ring-amber-400 ring-offset-1",
                  )}
                >
                  {i + 1}
                  {st === "answeredReview" && (
                    <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </div>

        {/* -------- RIGHT: NTA-style sticky palette sidebar (desktop only) -------- */}
        <aside className="hidden lg:block">
          <div className="sticky top-3 space-y-3">
            {/* Timer + subject header */}
            <div className="rounded border border-slate-300 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Time Left</div>
                <span className={cn("rounded px-2 py-0.5 font-mono text-sm font-bold tabular-nums text-white", timeCritical ? "bg-rose-500" : "bg-orange-500")}>
                  {mm}:{ss}
                </span>
              </div>
              <div className="text-xs text-slate-600">Subject: <span className="font-semibold text-slate-900">{q.subject}</span></div>
            </div>

            {/* Legend counts – NTA style */}
            <div className="rounded border border-slate-300 bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <NtaLegend count={counts.notVisited} label="Not Visited" cls="bg-white text-slate-800 border-slate-400" />
                <NtaLegend count={counts.notAnswered} label="Not Answered" cls="bg-orange-500 text-white border-orange-600" />
                <NtaLegend count={counts.answered} label="Answered" cls="bg-emerald-500 text-white border-emerald-600" />
                <NtaLegend count={counts.review} label="Marked for Review" cls="bg-violet-600 text-white border-violet-700" />
                <NtaLegend count={counts.answeredReview} label="Answered & Marked (evaluated)" cls="bg-violet-600 text-white border-violet-700" dot span2 />
              </div>
            </div>

            {/* Grid */}
            <div className="rounded border border-slate-300 bg-white shadow-sm">
              <div className="bg-slate-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                {q.subject} — Question Palette
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-3">
                <div className="grid grid-cols-6 gap-1.5">
                  {questions.map((qq, i) => {
                    const st = state(i);
                    return (
                      <button
                        key={qq.id}
                        onClick={() => setCurrent(i)}
                        title={`Q${i + 1} · ${qq.subject}`}
                        className={cn(
                          "relative flex h-9 w-9 items-center justify-center rounded-sm border text-[13px] font-bold transition",
                          st === "notVisited" && "border-slate-400 bg-white text-slate-800",
                          st === "notAnswered" && "border-orange-600 bg-orange-500 text-white",
                          st === "answered" && "border-emerald-600 bg-emerald-500 text-white",
                          st === "review" && "border-violet-700 bg-violet-600 text-white",
                          st === "answeredReview" && "border-violet-700 bg-violet-600 text-white",
                          i === current && "ring-2 ring-amber-400 ring-offset-1",
                        )}
                      >
                        {i + 1}
                        {st === "answeredReview" && (
                          <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <button onClick={() => setConfirmingSubmit(true)} className="w-full rounded bg-emerald-500 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-emerald-600">Submit Test</button>
              </div>
            </div>
          </div>
        </aside>
      </div>



      {confirmingSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <div className="text-lg font-bold">Submit test?</div>
              </div>
              <p className="text-sm text-muted-foreground">
                You have attempted {answeredCount} of {questions.length} questions. Unanswered
                questions will be marked as skipped (0 marks).
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmingSubmit(false)}>Continue Test</Button>
                <Button onClick={() => { setConfirmingSubmit(false); setSubmitted(true); }}>Submit Now</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PyqLegend({ count, label, swatch, dot }: { count: number; label: string; swatch: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("relative flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 text-[11px] font-bold", swatch)}>
        {count}
        {dot && <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </span>
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function NtaLegend({ count, label, cls, dot, span2 }: { count: number; label: string; cls: string; dot?: boolean; span2?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", span2 && "col-span-2")}>
      <span className={cn("relative flex h-6 min-w-[24px] items-center justify-center rounded border px-1.5 text-[11px] font-bold", cls)}>
        {count}
        {dot && <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />}
      </span>
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

// ---------------- Palette ----------------

function PalettePanel({
  questions,
  current,
  paletteIndices,
  subjectFilter,
  subjects,
  onSetSubject,
  onGo,
  stateOf,
  answeredCount,
  onSubmit,
}: {
  questions: PYQ[];
  current: number;
  paletteIndices: { qq: PYQ; i: number }[];
  subjectFilter: string;
  subjects: string[];
  onSetSubject: (s: string) => void;
  onGo: (i: number) => void;
  stateOf: (i: number) => QState;
  answeredCount: number;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Question Palette
        </div>

        {/* Subject filter (like NTA subject tabs) */}
        <div className="mb-3 flex flex-wrap gap-1">
          <button
            onClick={() => onSetSubject("All")}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              subjectFilter === "All"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            All
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => onSetSubject(s)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                subjectFilter === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-5 gap-1.5">
          {paletteIndices.map(({ qq, i }) => {
            const st = stateOf(i);
            const isCurrent = i === current;
            return (
              <button
                key={qq.id}
                onClick={() => onGo(i)}
                title={`Q${i + 1} · ${qq.subject}`}
                className={cn(
                  "relative h-8 w-full rounded-md border text-[11px] font-bold transition-transform hover:scale-105",
                  isCurrent && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  st === "notVisited" && "border-border bg-card text-muted-foreground",
                  st === "notAnswered" &&
                    "border-rose-500 bg-rose-500 text-white",
                  st === "answered" &&
                    "border-emerald-500 bg-emerald-500 text-white",
                  st === "review" &&
                    "border-violet-500 bg-violet-500 text-white",
                  st === "answeredReview" &&
                    "border-violet-600 bg-violet-500 text-white",
                )}
              >
                {i + 1}
                {st === "answeredReview" && (
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
          <LegendDot cls="bg-emerald-500 border-emerald-500" label="Answered" />
          <LegendDot cls="bg-rose-500 border-rose-500" label="Not Answered" />
          <LegendDot cls="bg-card border-border" label="Not Visited" />
          <LegendDot cls="bg-violet-500 border-violet-500" label="Marked" />
        </div>

        <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Answered <span className="font-semibold text-foreground">{answeredCount}</span> /{" "}
          {questions.length}
        </div>

        <Button className="mt-3 w-full" onClick={onSubmit}>
          Submit Test
        </Button>
      </CardContent>
    </Card>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded-sm border", cls)} />
      {label}
    </span>
  );
}

// ---------------- Bits ----------------

function BackBtn({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "primary" | "success" | "danger";
}) {
  const toneCls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-rose-600"
        : "text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-bold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function QuestionReview({ q, picked }: { q: PYQ; picked?: string }) {
  const correctSet = new Set((q.correct ?? []).map((c) => c.toUpperCase()));
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge className={cn("border-0", SUBJECT_COLORS[q.subject])}>{q.subject}</Badge>
          <Badge variant="secondary">NEET {q.year}</Badge>
          <Badge variant="secondary">{q.chapter}</Badge>
        </div>
        <div className="text-[15px] leading-relaxed">
          <PyqRichText html={q.text} />
        </div>
        <div className="mt-4 grid gap-2">
          {(q.options ?? []).map((opt) => {
            const key = opt.key.toUpperCase();
            const isCorrect = correctSet.has(key);
            const isPicked = picked === key;
            return (
              <div
                key={key}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 text-sm",
                  isCorrect && "border-emerald-500 bg-emerald-500/10",
                  !isCorrect && isPicked && "border-rose-500 bg-rose-500/10",
                  !isCorrect && !isPicked && "border-border bg-card opacity-80",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                    isCorrect
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isPicked
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-border",
                  )}
                >
                  {key}
                </span>
                <span className="flex-1">
                  <PyqRichText html={opt.text} />
                  {opt.image && (
                    <img
                      src={opt.image}
                      alt=""
                      loading="lazy"
                      className="mt-2 max-h-48 rounded-lg border border-border bg-card object-contain"
                    />
                  )}
                </span>
                {isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                {!isCorrect && isPicked && <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-xs font-semibold text-muted-foreground">
          Correct answer: {[...correctSet].join(", ")}
          {picked ? ` · Your answer: ${picked}` : " · Not answered"}
        </div>
        {q.explanation && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Explanation
            </div>
            <div>
              <PyqRichText html={q.explanation} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
