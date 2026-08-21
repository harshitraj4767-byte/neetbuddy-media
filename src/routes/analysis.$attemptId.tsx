import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, SkipForward, Target, ClipboardCheck, Clock, BarChart3, ChevronDown, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeRichText as RichText } from "@/components/safe-rich-text";
import { attachQuestionMedia } from "@/lib/question-media";

import { ReportQuestionButton } from "@/components/report-question-button";
import { ReasonBreakdown } from "@/components/reason-breakdown";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/analysis/$attemptId")({
  head: () => ({ meta: [{ title: "Analysis — Neet Buddy" }] }),
  component: AnalysisPage,
});

type Attempt = {
  id: string; test_id: string; score: number;
  correct_count: number; wrong_count: number; unattempted_count: number;
  time_taken_sec: number | null; answers: Record<string, number>; bookmarks: string[];
  submitted_at: string | null;
};
type Test = { id: string; title: string; type: string; duration_min: number; total_questions: number; question_ids: string[]; marks_correct: number };
type Question = { id: string; text: string; options: string[]; correct_index: number; difficulty: string; source: string; marks_correct: number; marks_wrong: number; explanation: string | null; subject_id?: string | null; chapter_id?: string | null };
type Lookup = Record<string, string>;

function AnalysisPage() {
  const { attemptId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Lookup>({});
  const [chapters, setChapters] = useState<Lookup>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"summary" | "solutions">("summary");
  const [solFilter, setSolFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const [reasonFilter, setReasonFilter] = useState<string | "all">("all");
  const [reasons, setReasons] = useState<Record<string, string>>({});



  useEffect(() => { if (!authLoading && !user) nav({ to: "/login" }); }, [user, authLoading, nav]);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("attempts").select("*").eq("id", attemptId).maybeSingle();
      if (!a) { setLoading(false); return; }
      const { data: t } = await supabase.from("tests").select("*").eq("id", a.test_id).maybeSingle();
      // Guard: contest attempts must never expose solutions/reattempt here.
      if (t?.type === "contest") {
        nav({ to: "/contests" });
        return;
      }
      setAttempt(a as Attempt);
      setTest(t as Test | null);
      const ids = (t?.question_ids ?? []) as string[];
      if (ids.length) {
        const { data: qs } = await supabase.from("questions").select("*").in("id", ids);
        const ordered = ids
          .map((id) => qs?.find((q) => q.id === id))
          .filter(Boolean)
          // Same image handling as the quiz page (diagrams / explanation images).
          .map((q) => attachQuestionMedia(q as Question)) as Question[];
        setQuestions(ordered);

        const subjIds = Array.from(new Set(ordered.map((q) => q.subject_id).filter(Boolean))) as string[];
        const chapIds = Array.from(new Set(ordered.map((q) => q.chapter_id).filter(Boolean))) as string[];
        const [{ data: subs }, { data: chs }] = await Promise.all([
          subjIds.length ? supabase.from("subjects").select("id,name").in("id", subjIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          chapIds.length ? supabase.from("chapters").select("id,name").in("id", chapIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        setSubjects(Object.fromEntries((subs ?? []).map((s) => [s.id, s.name])));
        setChapters(Object.fromEntries((chs ?? []).map((c) => [c.id, c.name])));
        const { data: aa } = await (supabase as any)
          .from("attempt_answers")
          .select("question_id,wrong_reason")
          .eq("attempt_id", attemptId);
        const rmap: Record<string, string> = {};
        (aa ?? []).forEach((r: any) => { if (r.wrong_reason) rmap[r.question_id] = r.wrong_reason; });
        setReasons(rmap);
      }
      setLoading(false);
    })();
  }, [attemptId, nav]);

  if (loading || authLoading) return <LoadingScreen variant="result" />;
  if (!attempt || !test) return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div>
        <p className="text-muted-foreground">Attempt not found.</p>
        <Button asChild variant="link"><Link to="/analytics">Back to analytics</Link></Button>
      </div>
    </div>
  );

  const total = (attempt.correct_count ?? 0) + (attempt.wrong_count ?? 0) + (attempt.unattempted_count ?? 0);
  const max = questions.reduce((s, q) => s + q.marks_correct, 0) || (test.total_questions * (test.marks_correct ?? 4));
  const score = Number(attempt.score ?? 0);
  const attempted = (attempt.correct_count ?? 0) + (attempt.wrong_count ?? 0);
  const accuracy = attempted ? Math.round(((attempt.correct_count ?? 0) / attempted) * 100) : 0;
  const completedPct = total ? Math.round((attempted / total) * 100) : 0;
  const timeSec = attempt.time_taken_sec ?? 0;
  const th = Math.floor(timeSec / 3600), tm = Math.floor((timeSec % 3600) / 60), ts = timeSec % 60;
  const timeFmt = `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}:${String(ts).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/analytics" aria-label="Back" className="rounded-full p-2 hover:bg-secondary"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 flex-1 truncate text-base font-bold">{test.title}</div>
          <Badge className="rounded-full border border-primary/20 bg-primary/10 text-primary hover:bg-primary/15">XP {Math.max(0, Math.round(score * 10))}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {/* Hero card — DPP style */}
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
          <CardContent className="p-5 sm:p-6">
            <h2 className="text-xl font-bold leading-tight sm:text-2xl">{test.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{total} questions · {max} marks</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                <Link to="/quiz/$testId" params={{ testId: test.id }}>Reattempt</Link>
              </Button>
              <Button onClick={() => setTab("solutions")} className="bg-gradient-primary">View Solutions</Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          <button onClick={() => setTab("summary")} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition", tab === "summary" ? "bg-background shadow-sm" : "text-muted-foreground")}>Your Progress</button>
          <button onClick={() => setTab("solutions")} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition", tab === "solutions" ? "bg-background shadow-sm" : "text-muted-foreground")}>Solutions</button>
        </div>

        {tab === "summary" ? (
          <>
            {/* Score card */}
            <Card>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Score</div>
                  <div className="mt-1"><span className="text-4xl font-extrabold text-primary">{score}</span><span className="text-xl text-muted-foreground">/{max}</span></div>
                </div>
                <div className="flex h-16 w-24 items-end gap-1">
                  <span className="h-[40%] flex-1 rounded-sm bg-emerald-400/80" />
                  <span className="h-[70%] flex-1 rounded-sm bg-sky-400/80" />
                  <span className="h-[55%] flex-1 rounded-sm bg-amber-400/80" />
                  <span className="h-[85%] flex-1 rounded-sm bg-rose-400/80" />
                </div>
              </CardContent>
            </Card>

            {/* Bars */}
            <Bar icon={CheckCircle2} iconClass="text-emerald-600" label="Correct" value={attempt.correct_count ?? 0} total={total} fill="bg-emerald-500" />
            <Bar icon={XCircle} iconClass="text-rose-600" label="Incorrect" value={attempt.wrong_count ?? 0} total={total} fill="bg-rose-500" />
            <Bar icon={SkipForward} iconClass="text-muted-foreground" label="Skipped" value={attempt.unattempted_count ?? 0} total={total} fill="bg-muted-foreground" />

            {/* Tiny stats */}
            <div className="grid grid-cols-3 gap-3">
              <MiniStat icon={Target} tint="bg-primary/10 text-primary" label="Accuracy" value={`${accuracy}%`} />
              <MiniStat icon={ClipboardCheck} tint="bg-violet-500/10 text-violet-600" label="Completed" value={`${completedPct}%`} />
              <MiniStat icon={Clock} tint="bg-amber-500/10 text-amber-600" label="Time Taken" value={timeFmt} />
            </div>

            {(() => {
              const ans = attempt.answers ?? {};
              // ----- Difficulty x Accuracy -----
              const diffBuckets: Record<string, { correct: number; attempted: number; total: number }> = {
                easy: { correct: 0, attempted: 0, total: 0 },
                medium: { correct: 0, attempted: 0, total: 0 },
                hard: { correct: 0, attempted: 0, total: 0 },
              };
              // ----- Subject buckets -----
              const subjBuckets: Record<string, { name: string; correct: number; attempted: number; total: number }> = {};
              // ----- Chapter wrong counts (weak topics) -----
              const chapWrong: Record<string, { name: string; subject: string; wrong: number; total: number }> = {};

              questions.forEach((q) => {
                const d = (q.difficulty || "medium").toLowerCase();
                const bucket = diffBuckets[d] ?? diffBuckets.medium;
                bucket.total++;
                const u = ans[q.id];
                const attempted = u !== undefined;
                const ok = attempted && u === q.correct_index;
                if (attempted) bucket.attempted++;
                if (ok) bucket.correct++;

                const sid = q.subject_id || "unknown";
                const sname = (q.subject_id && subjects[q.subject_id]) || "Other";
                (subjBuckets[sid] ||= { name: sname, correct: 0, attempted: 0, total: 0 });
                subjBuckets[sid].total++;
                if (attempted) subjBuckets[sid].attempted++;
                if (ok) subjBuckets[sid].correct++;

                if (attempted && !ok && q.chapter_id) {
                  const cname = chapters[q.chapter_id] || "Unknown chapter";
                  (chapWrong[q.chapter_id] ||= { name: cname, subject: sname, wrong: 0, total: 0 });
                  chapWrong[q.chapter_id].wrong++;
                }
                if (q.chapter_id && chapWrong[q.chapter_id]) chapWrong[q.chapter_id].total++;
              });

              // Subject-wise time = total time × (subject attempted / total attempted)
              const totalAttempted = (attempt.correct_count ?? 0) + (attempt.wrong_count ?? 0);
              const subjEntries = Object.values(subjBuckets).sort((a, b) => b.total - a.total);
              const subjOrder = ["physics", "chemistry", "biology", "bot", "zoo"];
              subjEntries.sort((a, b) => {
                const ia = subjOrder.findIndex((o) => a.name.toLowerCase().includes(o));
                const ib = subjOrder.findIndex((o) => b.name.toLowerCase().includes(o));
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
              });

              const weakTopics = Object.values(chapWrong)
                .sort((a, b) => b.wrong - a.wrong)
                .slice(0, 5);

              return (
                <>
                  {/* Difficulty vs Accuracy */}
                  <Card>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <BarChart3 className="h-4 w-4 text-primary" /> Difficulty vs Accuracy
                      </div>
                      <div className="space-y-3">
                        {(["easy", "medium", "hard"] as const).map((k) => {
                          const b = diffBuckets[k];
                          const acc = b.attempted ? Math.round((b.correct / b.attempted) * 100) : 0;
                          const color = k === "easy" ? "bg-emerald-500" : k === "medium" ? "bg-amber-500" : "bg-rose-500";
                          return (
                            <div key={k}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-semibold capitalize">{k}</span>
                                <span className="tabular-nums text-muted-foreground">{b.correct}/{b.attempted} attempted · {acc}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                <div className={cn("h-full transition-all", color)} style={{ width: `${acc}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Subject-wise Accuracy */}
                  <Card>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Target className="h-4 w-4 text-primary" /> Subject-wise Accuracy
                      </div>
                      <div className="space-y-3">
                        {subjEntries.map((s) => {
                          const acc = s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
                          const sn = s.name.toLowerCase();
                          const fill = sn.includes("phy") ? "bg-blue-500" : sn.includes("chem") ? "bg-violet-500" : sn.includes("bot") ? "bg-emerald-500" : sn.includes("zoo") ? "bg-teal-500" : "bg-primary";
                          return (
                            <div key={s.name}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-semibold">{s.name}</span>
                                <span className="tabular-nums text-muted-foreground">{s.correct}/{s.attempted} · {acc}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                <div className={cn("h-full transition-all", fill)} style={{ width: `${acc}%` }} />
                              </div>
                            </div>
                          );
                        })}
                        {subjEntries.length === 0 && (
                          <div className="text-xs text-muted-foreground">No subject data available.</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Subject-wise time spent (estimated by attempted share) */}
                  <Card>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Clock className="h-4 w-4 text-amber-600" /> Subject-wise Time
                      </div>
                      <div className="space-y-3">
                        {subjEntries.map((s) => {
                          const share = totalAttempted ? s.attempted / totalAttempted : 0;
                          const sec = Math.round(timeSec * share);
                          const hh = Math.floor(sec / 3600);
                          const mm = Math.floor((sec % 3600) / 60);
                          const ss = sec % 60;
                          const fmt = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
                          return (
                            <div key={s.name} className="flex items-center justify-between">
                              <span className="text-sm font-semibold">{s.name}</span>
                              <span className="tabular-nums text-sm text-muted-foreground">{fmt}</span>
                            </div>
                          );
                        })}
                        {totalAttempted === 0 && (
                          <div className="text-xs text-muted-foreground">No attempted questions to estimate time.</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Why correct / wrong / skipped — just above weak topics */}
                  <ReasonBreakdown questions={questions} answers={attempt.answers ?? {}} reasons={reasons} hint="Open Solutions to tag reasons per question." />

                  {/* Weak topics */}
                  <Card>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <XCircle className="h-4 w-4 text-rose-600" /> Weak Topics
                      </div>
                      {weakTopics.length === 0 ? (
                        <div className="text-xs text-muted-foreground">Great — no recurring weak topics in this attempt!</div>
                      ) : (
                        <div className="space-y-2">
                          {weakTopics.map((c) => (
                            <div key={c.name} className="flex items-center justify-between rounded-lg border border-rose-200/50 bg-rose-500/5 px-3 py-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{c.name}</div>
                                <div className="text-[11px] text-muted-foreground">{c.subject}</div>
                              </div>
                              <Badge className="bg-rose-600 hover:bg-rose-600">{c.wrong} wrong</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </>
        ) : (
          <div className="space-y-2.5">
            {(() => {
              const counts = { all: 0, correct: 0, wrong: 0, skipped: 0 };
              const reasonCounts: Record<string, number> = {};
              questions.forEach((q) => {
                const u = attempt.answers?.[q.id];
                const ok = u === q.correct_index;
                const statusKind: "correct" | "wrong" | "skipped" = u === undefined ? "skipped" : ok ? "correct" : "wrong";
                counts.all++;
                if (statusKind === "skipped") counts.skipped++;
                else if (statusKind === "correct") counts.correct++;
                else counts.wrong++;
                if (statusKind === "correct" || statusKind === "wrong") {
                  const r = reasons[q.id] || "untracked";
                  reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
                }
              });
              const chips: { k: typeof solFilter; label: string; cls: string }[] = [
                { k: "all", label: `All (${counts.all})`, cls: "border-primary/40 data-[on=true]:bg-primary data-[on=true]:text-primary-foreground" },
                { k: "correct", label: `Correct (${counts.correct})`, cls: "border-emerald-400 data-[on=true]:bg-emerald-500 data-[on=true]:text-white" },
                { k: "wrong", label: `Wrong (${counts.wrong})`, cls: "border-rose-400 data-[on=true]:bg-rose-500 data-[on=true]:text-white" },
                { k: "skipped", label: `Skipped (${counts.skipped})`, cls: "border-border data-[on=true]:bg-foreground data-[on=true]:text-background" },
              ];
              const isReasonFilterActive = solFilter === "correct" || solFilter === "wrong" || solFilter === "skipped";
              const reasonOptions = solFilter === "wrong" ? WRONG_REASONS
                : solFilter === "correct" ? CORRECT_REASONS
                : solFilter === "skipped" ? SKIPPED_REASONS
                : [];
              const activeTone = solFilter === "wrong" ? "border-rose-500 bg-rose-500 text-white"
                : solFilter === "correct" ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-foreground bg-foreground text-background";
              // also count skipped reasons
              questions.forEach((q) => {
                const u = attempt.answers?.[q.id];
                if (u === undefined) {
                  const r = reasons[q.id] || "untracked";
                  reasonCounts[`skip:${r}`] = (reasonCounts[`skip:${r}`] ?? 0) + 1;
                }
              });
              const skipCount = (v: string) => reasonCounts[`skip:${v}`] ?? 0;
              const reasonCount = (v: string) =>
                solFilter === "skipped" ? skipCount(v) : (reasonCounts[v] ?? 0);
              return (
                <>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <button
                        key={c.k}
                        data-on={solFilter === c.k}
                        onClick={() => { setSolFilter(c.k); setReasonFilter("all"); }}
                        className={cn("rounded-full border bg-background px-3 py-1 text-xs font-semibold transition", c.cls)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {isReasonFilterActive && reasonOptions.length > 0 && (
                    <div className="rounded-xl border border-border bg-background p-2.5">
                      <div className={cn("mb-2 text-xs font-semibold",
                        solFilter === "wrong" ? "text-rose-600"
                        : solFilter === "correct" ? "text-emerald-600"
                        : "text-muted-foreground")}>
                        {solFilter === "wrong" ? "Why wrong?" : solFilter === "correct" ? "Why correct?" : "Why unattempted?"} — filter by reason
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setReasonFilter("all")}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition",
                            reasonFilter === "all" ? activeTone : "border-border bg-background hover:bg-secondary"
                          )}
                        >
                          All ({counts[solFilter]})
                        </button>
                        {reasonOptions.map((r) => {
                          const cnt = reasonCount(r.value);
                          if (cnt === 0) return null;
                          return (
                            <button
                              key={r.value}
                              onClick={() => setReasonFilter(r.value)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs font-medium transition",
                                reasonFilter === r.value ? activeTone : "border-border bg-background hover:bg-secondary"
                              )}
                            >
                              {r.label} ({cnt})
                            </button>
                          );
                        })}
                        {reasonCount("untracked") > 0 && (
                          <button
                            onClick={() => setReasonFilter("untracked")}
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs font-medium transition",
                              reasonFilter === "untracked" ? activeTone : "border-border bg-background hover:bg-secondary"
                            )}
                          >
                            Not tagged ({reasonCount("untracked")})
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {questions.map((q, i) => {
              const u = attempt.answers?.[q.id];
              const ok = u === q.correct_index;
              const points = u === undefined ? 0 : ok ? q.marks_correct : q.marks_wrong;
              const statusKind: "correct" | "wrong" | "skipped" = u === undefined ? "skipped" : ok ? "correct" : "wrong";
              if (solFilter !== "all" && solFilter !== statusKind) return null;
              if (solFilter !== "all") {
                const r = reasons[q.id] || "untracked";
                if (reasonFilter !== "all" && reasonFilter !== r) return null;
              }
              return (
                <SolutionRow
                  key={q.id}
                  index={i + 1}
                  q={q}
                  userIdx={u}
                  status={statusKind}
                  points={points}
                  attemptId={attemptId}
                  reason={reasons[q.id]}
                  onReason={(r) => setReasons((prev) => ({ ...prev, [q.id]: r }))}
                />
              );
            })}
          </div>

        )}


        <div className="pt-2">
          <Button asChild variant="outline" className="w-full"><Link to="/analytics">Back to analytics</Link></Button>
        </div>
      </main>
    </div>
  );
}

const WRONG_REASONS: { value: string; label: string }[] = [
  { value: "guess", label: "I guessed" },
  { value: "conceptual", label: "Conceptual error" },
  { value: "calculation", label: "Calculation mistake" },
  { value: "silly_mistake", label: "Silly mistake" },
  { value: "misread", label: "Misread the question" },
  { value: "time_pressure", label: "Ran out of time" },
  { value: "other", label: "Other" },
];
const CORRECT_REASONS: { value: string; label: string }[] = [
  { value: "confident", label: "Knew it confidently" },
  { value: "concept_clear", label: "Concept was clear" },
  { value: "elimination", label: "By elimination" },
  { value: "lucky_guess", label: "Lucky guess" },
  { value: "revised_recently", label: "Revised recently" },
  { value: "other", label: "Other" },
];
const SKIPPED_REASONS: { value: string; label: string }[] = [
  { value: "no_time", label: "Ran out of time" },
  { value: "didnt_know", label: "Didn't know it" },
  { value: "too_hard", label: "Too hard" },
  { value: "confusing", label: "Confusing question" },
  { value: "skipped_deliberate", label: "Skipped deliberately" },
  { value: "other", label: "Other" },
];

function SolutionRow({ index, q, userIdx, status, points, attemptId, reason, onReason }: { index: number; q: Question; userIdx: number | undefined; status: "correct" | "wrong" | "skipped"; points: number; attemptId: string; reason?: string; onReason: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const tone =
    status === "correct" ? { ring: "ring-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", label: "Correct", Icon: CheckCircle2 }
    : status === "wrong" ? { ring: "ring-rose-500/40 bg-rose-500/5", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-400", label: "Wrong", Icon: XCircle }
    : { ring: "ring-border bg-card", dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Unattempted", Icon: HelpCircle };
  const Icon = tone.Icon;
  async function saveReason(r: string) {
    setSaving(true);
    // Upsert because attempt_answers may not have a row for this q yet
    // (skipped questions never had one created at submit time).
    const isCorrect = status === "correct";
    const selected = status === "skipped" ? null : userIdx ?? null;
    const { error } = await (supabase as any)
      .from("attempt_answers")
      .upsert(
        { attempt_id: attemptId, question_id: q.id, selected_index: selected, is_correct: isCorrect, wrong_reason: r },
        { onConflict: "attempt_id,question_id" },
      );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onReason(r);
    toast.success("Saved");
  }
  return (
    <Card className={cn("ring-1", tone.ring)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold tabular-nums">{index}</span>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-center gap-1.5 font-semibold leading-tight", tone.text)}>
            <Icon className="h-4 w-4" /> {tone.label}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{points > 0 ? `+${points}` : points} points</div>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <CardContent className="space-y-3 px-4 pb-4 pt-0">
          <div className="text-sm sm:text-base"><RichText>{q.text}</RichText></div>
          <div className="grid gap-2">
            {q.options.map((opt, j) => {
              const isCorrect = j === q.correct_index;
              const isUser = j === userIdx;
              return (
                <div key={j} className={cn(
                  "flex items-center gap-2 rounded-xl border p-3 text-sm",
                  isCorrect ? "border-emerald-500/50 bg-emerald-500/10" : isUser ? "border-rose-500/50 bg-rose-500/10" : "border-border",
                )}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-xs font-bold">{String.fromCharCode(65 + j)}</span>
                  <span className="flex-1"><RichText>{opt}</RichText></span>
                  {isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {isUser && !isCorrect && <XCircle className="h-4 w-4 text-rose-600" />}
                </div>
              );
            })}
          </div>
          {q.explanation && (
            <div className="rounded-xl bg-secondary/50 p-3 text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Explanation</div>
              <RichText>{q.explanation}</RichText>
            </div>
          )}
          {(() => {
            const opts = status === "wrong" ? WRONG_REASONS
              : status === "correct" ? CORRECT_REASONS
              : SKIPPED_REASONS;
            const tint = status === "wrong"
              ? { border: "border-rose-500/30", bg: "bg-rose-500/5", text: "text-rose-700 dark:text-rose-400", on: "border-rose-500 bg-rose-500 text-white", hover: "hover:border-rose-400 hover:text-rose-700", label: "Why did you get this wrong?" }
              : status === "correct"
              ? { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-700 dark:text-emerald-400", on: "border-emerald-500 bg-emerald-500 text-white", hover: "hover:border-emerald-400 hover:text-emerald-700", label: "How did you get this correct?" }
              : { border: "border-border", bg: "bg-muted/40", text: "text-muted-foreground", on: "border-foreground bg-foreground text-background", hover: "hover:border-foreground/60 hover:text-foreground", label: "Why didn't you attempt this?" };
            return (
              <div className={cn("rounded-xl border p-3", tint.border, tint.bg)}>
                <div className={cn("mb-2 text-xs font-bold uppercase tracking-wider", tint.text)}>{tint.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      disabled={saving}
                      onClick={() => saveReason(r.value)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50",
                        reason === r.value ? tint.on : cn("border-border bg-background", tint.hover),
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {reason && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Tracked as: <span className="font-semibold">{opts.find((o) => o.value === reason)?.label ?? reason}</span>. Tap another to change.
                  </div>
                )}
              </div>
            );
          })()}
          <div className="flex justify-end">
            <ReportQuestionButton questionId={q.id} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Bar({ icon: Icon, iconClass, label, value, total, fill }: { icon: React.ComponentType<{ className?: string }>; iconClass: string; label: string; value: number; total: number; fill: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold"><Icon className={cn("h-4 w-4", iconClass)} /> {label}</div>
          <div className="text-sm font-bold tabular-nums">{value}/{total}</div>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full transition-all", fill)} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, tint, label, value }: { icon: React.ComponentType<{ className?: string }>; tint: string; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1.5 p-4">
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", tint)}><Icon className="h-4 w-4" /></span>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
