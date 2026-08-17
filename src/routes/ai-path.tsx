import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Route as RouteIcon, Sparkles, CheckCircle2, Circle, Clock, Play, Trophy, Lock, PartyPopper, TrendingUp, AlertTriangle, Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getCurrentPath, generateAiPath, updatePathProgress, generateWeeklyReport } from "@/lib/ai-path.functions";
import { toast } from "sonner";
import { FeatureLock } from "@/components/feature-lock";

export const Route = createFileRoute("/ai-path")({
  head: () => ({ meta: [{ title: "AI Path — Neet Buddy" }] }),
  component: () => (<FeatureLock feature="ai_path"><AiPathPage /></FeatureLock>),
});

type Day = {
  day: number;
  subjects?: string[];
  focus_subject: string;
  topics: string[];
  daily_tasks: string[];
  quiz_chapters?: string[];
  quiz_id?: string | null;
  quiz_result?: { score: number; correct_count: number; wrong_count: number; submitted_at: string } | null;
  time_min: number;
  motivation_note: string;
};
type Report = {
  wins: string[];
  gaps: string[];
  accuracy_delta: string;
  next_week_focus: string[];
  generated_at: string;
};
type Plan = {
  id: string; start_date: string;
  payload: { summary?: string; days: Day[]; user_focus?: string };
  progress: Record<string, boolean>;
  report: Report | null;
  created_at: string;
};
type PathResp = { path: Plan | null; completed: boolean; canRegenerate: boolean; nextEligibleAt: string | null };

function AiPathPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fetchPath = useServerFn(getCurrentPath);
  const gen = useServerFn(generateAiPath);
  const upd = useServerFn(updatePathProgress);
  const genReport = useServerFn(generateWeeklyReport);

  const [state, setState] = useState<PathResp | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [busyReport, setBusyReport] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focus, setFocus] = useState("");

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => {
    if (!user) return;
    fetchPath().then((r) => setState(r as PathResp)).catch(() => setState({ path: null, completed: false, canRegenerate: true, nextEligibleAt: null }));
  }, [user?.id]);

  async function onGen() {
    if (state && !state.canRegenerate) {
      toast.error(`Available on ${new Date(state.nextEligibleAt!).toLocaleDateString()}. AI Path is once per week.`);
      return;
    }
    if (state?.completed && !state.path?.report) {
      toast.error("Generate this week's improvement report first.");
      return;
    }
    if (!confirm(`Generate a fresh 7-day plan?`)) return;
    setBusy(true);
    try {
      const r = await gen({ data: { user_focus: focus.trim() || undefined } }) as { path: Plan };
      setState({ path: r.path, completed: false, canRegenerate: false, nextEligibleAt: new Date(new Date(r.path.created_at).getTime() + 7 * 24 * 3600 * 1000).toISOString() });
      setFocus(""); setFocusOpen(false);
      toast.success("Your 7-day path is ready!");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  async function onGenReport() {
    if (!state?.path) return;
    setBusyReport(true);
    try {
      const r = await genReport({ data: { path_id: state.path.id } }) as { report: Report };
      setState({ ...state, path: { ...state.path, report: r.report }, canRegenerate: true, nextEligibleAt: null });
      toast.success("Weekly report ready!");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusyReport(false); }
  }

  async function toggle(dayNum: number, idx: number, done: boolean) {
    if (!state?.path) return;
    const key = `d${dayNum}_${idx}`;
    const nextProgress = { ...state.path.progress, [key]: done };
    // Compute completion locally.
    const totalKeys: string[] = [];
    for (const d of state.path.payload.days) for (let i = 0; i < d.daily_tasks.length; i++) totalKeys.push(`d${d.day}_${i}`);
    const completed = totalKeys.every((k) => nextProgress[k] === true);
    setState({ ...state, path: { ...state.path, progress: nextProgress }, completed });
    try { await upd({ data: { path_id: state.path.id, key, done } }); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  if (loading || !user || state === undefined) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const plan = state.path;
  const locked = !state.canRegenerate;
  const nextAtDate = state.nextEligibleAt ? new Date(state.nextEligibleAt) : null;

  return (
    <PageShell eyebrow="Personalized" title="AI Path" description={`A 7-day NEET plan with a 50-question DPP for every day. Refresh weekly.`}>
      <Card className="mb-4 border-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 text-white shadow-elegant">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur"><RouteIcon className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest opacity-90">7-Day AI Plan</div>
              {plan ? (
                <>
                  <div className="text-lg font-extrabold">Started {new Date(plan.start_date).toLocaleDateString()}</div>
                  <div className="text-xs opacity-90">{plan.payload.summary ?? "Personalized to your performance"}</div>
                  {plan.payload.user_focus && (
                    <div className="mt-1 text-[11px] opacity-90">🎯 Your focus: {plan.payload.user_focus}</div>
                  )}
                </>
              ) : (
                <div className="text-sm opacity-90">Generate your first personalized 7-day plan.</div>
              )}
            </div>
          </div>

          {!locked && (
            <>
              <button
                type="button"
                onClick={() => setFocusOpen((v) => !v)}
                className="mt-3 text-left text-[11px] font-semibold uppercase tracking-widest opacity-90 underline underline-offset-2"
              >
                {focusOpen ? "Hide focus input" : "Optional: tell AI what to focus on"}
              </button>
              {focusOpen && (
                <Textarea
                  value={focus}
                  onChange={(e) => setFocus(e.target.value.slice(0, 500))}
                  placeholder="e.g. Human Reproduction, Rotational Motion, Coordination Compounds — I keep losing marks here."
                  className="mt-2 min-h-[80px] bg-white/15 text-white placeholder:text-white/60 border-white/30"
                />
              )}
            </>
          )}

          <Button onClick={onGen} disabled={busy || locked} variant="secondary" className="mt-4 w-full bg-white text-violet-700 hover:bg-white/90">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : locked ? <Lock className="mr-1.5 h-4 w-4" />
              : <Sparkles className="mr-1.5 h-4 w-4" />}
            {locked && nextAtDate ? `Next plan on ${nextAtDate.toLocaleDateString()}` : (plan ? `Generate new plan` : `Create my plan`)}
          </Button>
          {locked && (
            <div className="mt-2 text-center text-[11px] opacity-90">
              AI Path refreshes once a week — finish this week's tasks to unlock next week early.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly complete banner + report */}
      {plan && state.completed && !plan.report && (
        <Card className="mb-4 border-0 bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-elegant">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur"><PartyPopper className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-widest opacity-90">This week is done 🎉</div>
                <div className="text-base font-extrabold">Generate your improvement report</div>
                <div className="text-xs opacity-90">Then unlock next week's plan.</div>
              </div>
            </div>
            <Button onClick={onGenReport} disabled={busyReport} variant="secondary" className="mt-4 w-full bg-white text-emerald-700 hover:bg-white/90">
              {busyReport ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <TrendingUp className="mr-1.5 h-4 w-4" />}
              Generate weekly improvement report
            </Button>
          </CardContent>
        </Card>
      )}

      {plan?.report && (
        <Card className="mb-4 border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Trophy className="h-4 w-4 text-emerald-600" /> Weekly Improvement Report</div>
            <div className="mb-3 rounded-lg bg-secondary/60 p-2 text-xs italic">{plan.report.accuracy_delta}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ReportBlock icon={TrendingUp} tint="text-emerald-600" title="Wins" items={plan.report.wins} />
              <ReportBlock icon={AlertTriangle} tint="text-rose-600" title="Gaps" items={plan.report.gaps} />
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold"><Compass className="h-3.5 w-3.5 text-primary" /> Focus for next week</div>
              <div className="flex flex-wrap gap-1.5">
                {plan.report.next_week_focus.map((t, i) => (
                  <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t}</span>
                ))}
              </div>
            </div>
            <Button onClick={onGen} disabled={busy} className="mt-4 w-full bg-gradient-to-r from-violet-600 to-indigo-600">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Generate next week's plan
            </Button>
          </CardContent>
        </Card>
      )}

      {plan && plan.payload.days?.map((d) => (
        <Card key={d.day} className="mb-3 border-0 shadow-soft">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Day {d.day}</div>
                <div className="text-base font-bold truncate">{(d.subjects && d.subjects.length > 0 ? d.subjects.join(" • ") : d.focus_subject)}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {d.time_min} min</div>
            </div>
            {d.topics?.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {d.topics.map((t, i) => <span key={i} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">{t}</span>)}
              </div>
            )}
            <ul className="space-y-1.5">
              {d.daily_tasks.map((t, i) => {
                const key = `d${d.day}_${i}`;
                const done = !!plan.progress[key];
                return (
                  <li key={i}>
                    <button onClick={() => toggle(d.day, i, !done)} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-sm transition-colors hover:bg-secondary/50">
                      {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className={done ? "line-through text-muted-foreground" : ""}>{t}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {d.quiz_id && (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-primary">Day {d.day} · 50-Q DPP</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Practice on {(d.quiz_chapters ?? []).slice(0, 3).join(", ") || d.focus_subject}
                    </div>
                    {d.quiz_result && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <Trophy className="h-3 w-3" /> Scored {d.quiz_result.score} · {d.quiz_result.correct_count} correct / {d.quiz_result.wrong_count} wrong
                      </div>
                    )}
                  </div>
                  <Link to="/quiz/$testId" params={{ testId: d.quiz_id }}>
                    <Button size="sm" className="shrink-0">
                      <Play className="mr-1 h-3.5 w-3.5" /> {d.quiz_result ? "Retry" : "Start"}
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {d.motivation_note && <div className="mt-2 rounded-lg bg-gradient-to-r from-violet-50 to-fuchsia-50 p-2 text-xs italic text-violet-700 dark:from-violet-500/10 dark:to-fuchsia-500/10 dark:text-violet-300">💪 {d.motivation_note}</div>}
          </CardContent>
        </Card>
      ))}
    </PageShell>
  );
}

function ReportBlock({ icon: Icon, tint, title, items }: { icon: any; tint: string; title: string; items: string[] }) {
  return (
    <div>
      <div className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold ${tint}`}><Icon className="h-3.5 w-3.5" /> {title}</div>
      <ul className="space-y-1 text-sm">
        {items.map((s, i) => <li key={i} className="flex gap-1.5"><span className={tint}>•</span><span>{s}</span></li>)}
      </ul>
    </div>
  );
}
