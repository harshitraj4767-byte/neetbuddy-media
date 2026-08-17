import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Clock, Target, SkipForward, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PyqRichText } from "@/components/pyq-rich-text";

export const Route = createFileRoute("/pyqs/result/$attemptId")({
  head: () => ({
    meta: [
      { title: "NEET PYQ Result & Analysis | Neet Buddy" },
      { name: "description", content: "Detailed result, subject-wise analysis, and per-question explanations for your NEET PYQ attempt." },
      { property: "og:title", content: "NEET PYQ Result & Analysis" },
      { property: "og:description", content: "See your score, accuracy, chapter breakdown and full explanations for every question." },
    ],
  }),
  component: PyqResultPage,
  errorComponent: ({ error, reset }) => (
    <PageShell title="Result" description="Could not load this attempt.">
      <Card><CardContent className="p-6 text-sm">
        <div className="mb-3 font-semibold text-destructive">Error</div>
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{String(error?.message ?? error)}</pre>
        <Button className="mt-4" onClick={() => reset()}>Try again</Button>
      </CardContent></Card>
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell title="Attempt not found" description="This attempt does not exist or you don't have access.">
      <Link to="/pyqs" className="text-primary hover:underline text-sm inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4"/> Back to PYQs</Link>
    </PageShell>
  ),
});

type Attempt = {
  id: string;
  paper_id: string;
  responses: Record<string, string>;
  score: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  time_spent_sec: number;
  created_at: string;
};
type Paper = { id: string; title: string; year: number; total_questions: number; duration_minutes: number };
type Option = { key: string; text: string; image?: string | null };
type PYQ = {
  id: string; question_no: number | null; year: number; subject: string; chapter: string;
  text: string; options: Option[]; correct: string[]; explanation: string;
};

const SUBJECT_COLORS: Record<string, string> = {
  Physics: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  Chemistry: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Biology: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function PyqResultPage() {
  const { attemptId } = Route.useParams();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<PYQ[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"summary" | "solutions">("summary");
  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const [subject, setSubject] = useState<string>("All");

  useEffect(() => {
    (async () => {
      try {
        const { data: a, error: e1 } = await (supabase as any)
          .from("neet_pyq_attempts").select("*").eq("id", attemptId).maybeSingle();
        if (e1) throw e1;
        if (!a) { setError("Attempt not found"); return; }
        setAttempt(a as Attempt);
        const { data: p, error: e2 } = await (supabase as any)
          .from("neet_pyq_papers").select("id,title,year,total_questions,duration_minutes").eq("id", a.paper_id).maybeSingle();
        if (e2) throw e2;
        setPaper(p as Paper);
        const { data: qs, error: e3 } = await (supabase as any)
          .from("neet_pyq_questions").select("id,question_no,year,subject,chapter,text,options,correct,explanation")
          .eq("paper_id", a.paper_id).order("question_no", { ascending: true }).limit(500);
        if (e3) throw e3;
        setQuestions((qs ?? []) as PYQ[]);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load result");
      }
    })();
  }, [attemptId]);

  const analysis = useMemo(() => {
    if (!attempt || !questions) return null;
    const resp = attempt.responses ?? {};
    let correct = 0, wrong = 0, skipped = 0;
    const bySubj = new Map<string, { c: number; w: number; s: number }>();
    const byChap = new Map<string, { subj: string; c: number; w: number; s: number }>();
    const perQ = questions.map((q) => {
      const picked = resp[q.id];
      const correctSet = new Set((q.correct ?? []).map((c) => c.toUpperCase()));
      let status: "correct" | "wrong" | "skipped";
      if (!picked) { skipped++; status = "skipped"; }
      else if (correctSet.has(picked.toUpperCase())) { correct++; status = "correct"; }
      else { wrong++; status = "wrong"; }
      const bs = bySubj.get(q.subject) ?? { c: 0, w: 0, s: 0 };
      if (status === "correct") bs.c++; else if (status === "wrong") bs.w++; else bs.s++;
      bySubj.set(q.subject, bs);
      const bck = byChap.get(q.chapter) ?? { subj: q.subject, c: 0, w: 0, s: 0 };
      if (status === "correct") bck.c++; else if (status === "wrong") bck.w++; else bck.s++;
      byChap.set(q.chapter, bck);
      return { q, picked, status, correctSet };
    });
    const total = questions.length;
    const marks = correct * 4 - wrong;
    const maxMarks = total * 4;
    const attempted = correct + wrong;
    const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;
    // Weak areas: chapters with >=3 Qs and accuracy < 50%
    const weakChapters = [...byChap.entries()]
      .map(([chapter, b]) => {
        const att = b.c + b.w;
        const acc = att ? (b.c / att) * 100 : 0;
        return { chapter, subj: b.subj, c: b.c, w: b.w, s: b.s, att, acc, total: b.c + b.w + b.s };
      })
      .filter((x) => x.total >= 3 && x.acc < 60)
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 6);
    return { correct, wrong, skipped, marks, maxMarks, total, accuracy, bySubj, byChap, perQ, weakChapters };
  }, [attempt, questions]);

  if (error) return (
    <PageShell title="Result" description="Could not load this attempt.">
      <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
    </PageShell>
  );
  if (!attempt || !paper || !questions || !analysis) return (
    <PageShell title="Loading result…"><div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></PageShell>
  );

  const timeUsed = attempt.time_spent_sec ?? 0;
  const hh = Math.floor(timeUsed / 3600);
  const mm = Math.floor((timeUsed % 3600) / 60);
  const ss = timeUsed % 60;
  const timeFmt = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const totalQ = analysis.total;
  const attempted = analysis.correct + analysis.wrong;
  const completedPct = totalQ ? Math.round((attempted / totalQ) * 100) : 0;

  const subjects = ["All", ...Array.from(new Set(questions.map((q) => q.subject)))];
  const filteredQs = analysis.perQ.filter((row) => {
    if (subject !== "All" && row.q.subject !== subject) return false;
    if (filter !== "all" && row.status !== filter) return false;
    return true;
  });

  return (
    <PageShell eyebrow="NEET PYQ · Result & Analysis" title={paper.title}
      description={`Attempted on ${new Date(attempt.created_at).toLocaleString()}`}>
      <Link to="/pyqs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to PYQs
      </Link>

      {/* Hero card — CBT/Analysis style */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-xl font-bold leading-tight sm:text-2xl">{paper.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{totalQ} questions · {analysis.maxMarks} marks · {paper.year}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
              <Link to="/pyqs">Reattempt</Link>
            </Button>
            <Button onClick={() => setTab("solutions")} className="bg-gradient-primary">View Solutions</Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-xl bg-secondary p-1">
        <button onClick={() => setTab("summary")}
          className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
            tab === "summary" ? "bg-background shadow-sm" : "text-muted-foreground")}>Your Progress</button>
        <button onClick={() => setTab("solutions")}
          className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
            tab === "solutions" ? "bg-background shadow-sm" : "text-muted-foreground")}>Solutions</button>
      </div>

      {tab === "summary" ? (
        <div className="mt-4 space-y-4">
          {/* Score card */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Score</div>
                <div className="mt-1">
                  <span className="text-4xl font-extrabold text-primary">{analysis.marks}</span>
                  <span className="text-xl text-muted-foreground">/{analysis.maxMarks}</span>
                </div>
              </div>
              <div className="flex h-16 w-24 items-end gap-1">
                <span className="h-[40%] flex-1 rounded-sm bg-emerald-400/80" />
                <span className="h-[70%] flex-1 rounded-sm bg-sky-400/80" />
                <span className="h-[55%] flex-1 rounded-sm bg-amber-400/80" />
                <span className="h-[85%] flex-1 rounded-sm bg-rose-400/80" />
              </div>
            </CardContent>
          </Card>

          {/* Progress bars */}
          <Bar icon={CheckCircle2} iconClass="text-emerald-600" label="Correct" value={analysis.correct} total={totalQ} fill="bg-emerald-500" />
          <Bar icon={XCircle} iconClass="text-rose-600" label="Incorrect" value={analysis.wrong} total={totalQ} fill="bg-rose-500" />
          <Bar icon={SkipForward} iconClass="text-muted-foreground" label="Skipped" value={analysis.skipped} total={totalQ} fill="bg-muted-foreground" />

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-3">
            <MiniStat icon={Target} tint="bg-primary/10 text-primary" label="Accuracy" value={`${analysis.accuracy}%`} />
            <MiniStat icon={ClipboardCheck} tint="bg-violet-500/10 text-violet-600" label="Completed" value={`${completedPct}%`} />
            <MiniStat icon={Clock} tint="bg-amber-500/10 text-amber-600" label="Time Taken" value={timeFmt} />
          </div>

          {/* Subject analysis + Weak areas */}
          <div className="grid gap-4 lg:grid-cols-2">

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 text-sm font-semibold">Subject-wise breakdown</div>
            <div className="space-y-2">
              {[...analysis.bySubj.entries()].map(([subj, b]) => {
                const att = b.c + b.w;
                const acc = att ? Math.round((b.c / att) * 100) : 0;
                const totalQ = b.c + b.w + b.s;
                return (
                  <div key={subj} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Badge className={cn("border-0", SUBJECT_COLORS[subj])}>{subj}</Badge>
                      <div className="text-xs text-muted-foreground">{totalQ} Qs · {acc}% accuracy</div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="flex h-full">
                        <div className="bg-emerald-500" style={{ width: `${(b.c / totalQ) * 100}%` }} />
                        <div className="bg-rose-500" style={{ width: `${(b.w / totalQ) * 100}%` }} />
                        <div className="bg-slate-300 dark:bg-slate-700" style={{ width: `${(b.s / totalQ) * 100}%` }} />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs">
                      <span className="text-emerald-600">✓ {b.c}</span>
                      <span className="text-rose-600">✗ {b.w}</span>
                      <span className="text-muted-foreground">— {b.s}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-3 text-sm font-semibold">Weak chapters (below 60% accuracy)</div>
            {analysis.weakChapters.length === 0 ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                Great job — no weak chapters in this paper. Keep it up!
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.weakChapters.map((c) => (
                  <div key={c.chapter} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{c.chapter}</div>
                        <div className="text-xs text-muted-foreground">{c.subj} · {c.total} Qs</div>
                      </div>
                      <Badge variant="destructive" className="shrink-0">{Math.round(c.acc)}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
      {/* Question palette */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 text-sm font-semibold">Question navigator</div>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12 lg:grid-cols-16">
            {analysis.perQ.map((row, i) => (
              <a key={row.q.id} href={`#q-${i + 1}`}
                className={cn("flex h-9 items-center justify-center rounded border text-xs font-bold",
                  row.status === "correct" && "border-emerald-500 bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
                  row.status === "wrong" && "border-rose-500 bg-rose-500/20 text-rose-800 dark:text-rose-200",
                  row.status === "skipped" && "border-border bg-muted text-muted-foreground")}>
                {i + 1}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Show:</span>
        {(["all", "correct", "wrong", "skipped"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold capitalize",
              filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary")}>
            {f}
          </button>
        ))}
        <span className="ml-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject:</span>
        {subjects.map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold",
              subject === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary")}>
            {s}
          </button>
        ))}
      </div>

      {/* Per-question explanations */}
      <div className="mt-4 space-y-4">
        {filteredQs.map((row, idx) => {
          const originalIdx = analysis.perQ.indexOf(row);
          return (
            <Card key={row.q.id} id={`q-${originalIdx + 1}`}>
              <CardContent className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">Q{originalIdx + 1}</Badge>
                  <Badge className={cn("border-0", SUBJECT_COLORS[row.q.subject])}>{row.q.subject}</Badge>
                  <Badge variant="secondary">{row.q.chapter}</Badge>
                  {row.status === "correct" && <Badge className="bg-emerald-500 text-white">Correct</Badge>}
                  {row.status === "wrong" && <Badge variant="destructive">Wrong</Badge>}
                  {row.status === "skipped" && <Badge variant="secondary">Skipped</Badge>}
                </div>
                <div className="text-[15px] leading-relaxed">
                  <PyqRichText html={row.q.text} />
                </div>
                <div className="mt-4 grid gap-2">
                  {(row.q.options ?? []).map((opt) => {
                    const key = opt.key.toUpperCase();
                    const isCorrect = row.correctSet.has(key);
                    const isPicked = row.picked?.toUpperCase() === key;
                    return (
                      <div key={key} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm",
                        isCorrect && "border-emerald-500 bg-emerald-500/10",
                        !isCorrect && isPicked && "border-rose-500 bg-rose-500/10",
                        !isCorrect && !isPicked && "border-border bg-card opacity-80")}>
                        <span className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                          isCorrect ? "border-emerald-500 bg-emerald-500 text-white"
                            : isPicked ? "border-rose-500 bg-rose-500 text-white" : "border-border")}>
                          {key}
                        </span>
                        <span className="flex-1">
                          <PyqRichText html={opt.text} />
                          {opt.image && <img src={opt.image} alt="" loading="lazy" className="mt-2 max-h-48 rounded-lg border object-contain" />}
                        </span>
                        {isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                        {!isCorrect && isPicked && <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs font-semibold text-muted-foreground">
                  Correct: {[...row.correctSet].join(", ")}{row.picked ? ` · Your answer: ${row.picked}` : " · Not answered"}
                </div>
                {row.q.explanation && (
                  <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Explanation</div>
                    <PyqRichText html={row.q.explanation} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filteredQs.length === 0 && (
          <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No questions match this filter.</CardContent></Card>
        )}
      </div>
        </div>
      )}
    </PageShell>
  );
}

function Bar({ icon: Icon, iconClass, label, value, total, fill }: { icon: React.ComponentType<{ className?: string }>; iconClass: string; label: string; value: number; total: number; fill: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold"><Icon className={cn("h-4 w-4", iconClass)} />{label}</span>
          <span className="tabular-nums text-muted-foreground">{value}/{total} · {pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full transition-all", fill)} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, tint, label, value }: { icon: React.ComponentType<{ className?: string }>; tint: string; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-lg font-extrabold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
