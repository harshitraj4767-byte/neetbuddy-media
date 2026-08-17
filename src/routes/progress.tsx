import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Flame, TrendingUp, Calendar, Target, ChevronLeft, ChevronRight, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Weekly Progress — Neet Buddy" }] }),
  component: ProgressPage,
});

type Attempt = { correct_count: number; wrong_count: number; unattempted_count: number; submitted_at: string };
type SubjectAccuracy = { subject: string; correct: number; total: number; accuracy: number; color: string };

function startOfWeek(base: Date = new Date()) {
  const d = new Date(base); const day = d.getDay() || 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (day - 1)); return d;
}

function ProgressPage() {
  const { user, profile, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<number>((profile as unknown as { daily_goal?: number } | null)?.daily_goal ?? 20);
  const [subjectAcc, setSubjectAcc] = useState<SubjectAccuracy[] | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    // load last ~90 days for heatmap
    const since = new Date(); since.setDate(since.getDate() - 90); since.setHours(0, 0, 0, 0);
    supabase.from("attempts").select("correct_count,wrong_count,unattempted_count,submitted_at")
      .eq("user_id", user.id).eq("status", "completed").gte("submitted_at", since.toISOString())
      .then(({ data }) => setAttempts((data ?? []) as Attempt[]));
  }, [user]);

  // Subject-wise accuracy for current week (from attempts → tests → questions)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const ws = startOfWeek(); ws.setDate(ws.getDate() + weekOffset * 7);
      const we = new Date(ws); we.setDate(we.getDate() + 7);

      // Always start from the full subject list so all NEET subjects render,
      // even when the user has no attempts yet for some of them.
      const { data: allSubs } = await supabase
        .from("subjects")
        .select("id,name,color")
        .order("name");
      type SubRow = { id: string; name: string; color: string | null };
      const subjectsList = (allSubs ?? []) as SubRow[];
      const palette: Record<string, string> = {
        Physics: "#0ea5e9",
        Chemistry: "#f97316",
        Biology: "#10b981",
      };
      const baseBuckets = new Map<string, { correct: number; total: number; color: string }>();
      subjectsList.forEach((s) => {
        baseBuckets.set(s.name, { correct: 0, total: 0, color: s.color ?? palette[s.name] ?? "#6366f1" });
      });

      const { data: rows } = await supabase
        .from("attempts")
        .select("answers, test_id, tests(question_ids)")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .gte("submitted_at", ws.toISOString())
        .lt("submitted_at", we.toISOString());

      const all = (rows ?? []) as Array<{
        answers: Record<string, number> | null;
        tests: { question_ids: string[] | null } | null;
      }>;
      const qIds = Array.from(
        new Set(all.flatMap((r) => Object.keys(r.answers ?? {}))),
      );

      if (qIds.length > 0) {
        const { data: qs } = await supabase
          .from("questions")
          .select("id, correct_index, subject_id, subjects(name, color)")
          .in("id", qIds);
        type Q = { id: string; correct_index: number; subject_id: string | null; subjects: { name: string; color: string | null } | null };
        const qmap = new Map<string, Q>(((qs ?? []) as unknown as Q[]).map((q) => [q.id, q]));

        for (const r of all) {
          const ans = r.answers ?? {};
          for (const [qid, picked] of Object.entries(ans)) {
            const q = qmap.get(qid);
            if (!q || !q.subjects) continue;
            const name = q.subjects.name;
            const b = baseBuckets.get(name) ?? { correct: 0, total: 0, color: q.subjects.color ?? palette[name] ?? "#6366f1" };
            b.total++;
            if (picked === q.correct_index) b.correct++;
            baseBuckets.set(name, b);
          }
        }
      }

      const out: SubjectAccuracy[] = Array.from(baseBuckets.entries()).map(([subject, v]) => ({
        subject,
        correct: v.correct,
        total: v.total,
        accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        color: v.color,
      }));
      // Keep canonical NEET order if subjects table is missing entries
      const order = ["Physics", "Chemistry", "Biology"];
      out.sort((a, b) => {
        const ai = order.indexOf(a.subject); const bi = order.indexOf(b.subject);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return b.total - a.total;
      });
      setSubjectAcc(out);
    })();
  }, [user, weekOffset, attempts]);

  const goal = (profile as unknown as { daily_goal?: number } | null)?.daily_goal ?? 20;
  const weekStart = useMemo(() => { const w = startOfWeek(); w.setDate(w.getDate() + weekOffset * 7); return w; }, [weekOffset]);
  const weekEnd = useMemo(() => { const e = new Date(weekStart); e.setDate(e.getDate() + 7); return e; }, [weekStart]);
  const weekAttempts = useMemo(() => (attempts ?? []).filter((a) => { const d = new Date(a.submitted_at); return d >= weekStart && d < weekEnd; }), [attempts, weekStart, weekEnd]);

  const totalCorrect = weekAttempts.reduce((s, a) => s + (a.correct_count ?? 0), 0);
  const totalWrong = weekAttempts.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
  const totalQ = totalCorrect + totalWrong;
  const accuracy = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const weekTarget = goal * 7;

  // streak: consecutive days back from today with at least 1 attempt
  const streak = useMemo(() => {
    if (!attempts) return 0;
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const set = new Set((attempts ?? []).map((a) => dayKey(new Date(a.submitted_at))));
    let s = 0; const cur = new Date(); cur.setHours(0,0,0,0);
    while (set.has(dayKey(cur))) { s++; cur.setDate(cur.getDate() - 1); }
    return s;
  }, [attempts]);

  // 7-day display
  const dayLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const perDay = dayLabels.map((label, i) => {
    const day = new Date(weekStart); day.setDate(day.getDate() + i);
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const c = (attempts ?? []).filter((a) => { const d = new Date(a.submitted_at); return d >= day && d < next; })
      .reduce((s, a) => s + (a.correct_count ?? 0) + (a.wrong_count ?? 0), 0);
    return { label, day: day.getDate(), count: c, date: day };
  });

  const monthName = weekStart.toLocaleString("en", { month: "long", year: "numeric" });
  const rangeLabel = `${weekStart.getDate()} – ${new Date(weekEnd.getTime() - 1).getDate()} ${weekStart.toLocaleString("en", { month: "short", year: "numeric" })}`;

  // Heatmap data — last 12 weeks (84 days)
  const heatmap = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(today); start.setDate(start.getDate() - 83);
    // align to Monday
    const startDow = start.getDay() || 7;
    start.setDate(start.getDate() - (startDow - 1));
    const counts: Record<string, number> = {};
    (attempts ?? []).forEach((a) => { const k = new Date(a.submitted_at).toISOString().slice(0,10); counts[k] = (counts[k] ?? 0) + (a.correct_count ?? 0) + (a.wrong_count ?? 0); });
    const weeks: { date: Date; count: number }[][] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const w: { date: Date; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const k = cursor.toISOString().slice(0,10);
        w.push({ date: new Date(cursor), count: counts[k] ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(w);
    }
    return weeks;
  }, [attempts]);

  const heatColor = (c: number) => {
    if (c <= 0) return "bg-secondary/60";
    if (c < goal * 0.25) return "bg-primary/20";
    if (c < goal * 0.5) return "bg-primary/40";
    if (c < goal) return "bg-primary/65";
    return "bg-primary";
  };

  const saveGoal = async () => {
    if (!user) return;
    const v = Math.max(1, Math.min(500, Math.round(goalDraft)));
    setGoalOpen(false);
    // Optimistic: update query cache so UI reflects immediately
    const { error } = await supabase.from("profiles").update({ daily_goal: v }).eq("id", user.id);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success(`Daily goal updated to ${v}`);
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl">
        {/* Header bar */}
        <div className="-mt-2 mb-4 flex items-center justify-between">
          <button onClick={() => history.back()} className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-primary">
            <ChevronLeft className="h-5 w-5" /> Weekly Progress Report
          </button>
          <Link to="/dashboard" className="rounded-full p-1.5 text-primary hover:bg-primary/10"><Home className="h-5 w-5" /></Link>
        </div>

        {attempts === null ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
          <>
            {/* Profile / identity */}
            <Card className="mb-4 border-border">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                  {(profile?.full_name ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{profile?.full_name ?? user?.email}</div>
                  <div className="text-xs text-muted-foreground">NEET {(profile as unknown as { target_year?: number } | null)?.target_year ?? 2027}</div>
                </div>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </CardContent>
            </Card>

            {/* top stats */}
            <div className="grid grid-cols-3 gap-2.5">
              <Stat icon={Flame} value={`${streak}${streak > 0 ? "🔥" : ""}`} label="Day Streak" color="text-orange-600" border="border-t-orange-500" />
              <Stat icon={Calendar} value={String(totalQ)} label="This Week" color="text-primary" border="border-t-primary" />
              <Stat icon={TrendingUp} value={`${accuracy}%`} label="Accuracy" color="text-emerald-600" border="border-t-emerald-500" />
            </div>

            {/* Activity Calendar (current week) */}
            <section className="mt-6">
              <div className="mb-2 flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /><div className="text-sm font-bold">Activity Calendar</div></div>
              <Card>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <button onClick={() => setWeekOffset((o) => o - 1)} className="rounded-md p-1 hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
                    <div className="text-xs font-semibold text-foreground">{rangeLabel}</div>
                    <button onClick={() => setWeekOffset((o) => Math.min(0, o + 1))} disabled={weekOffset >= 0} className="rounded-md p-1 hover:bg-secondary disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {perDay.map((d) => {
                      const reached = d.count >= goal;
                      const partial = d.count > 0 && !reached;
                      return (
                        <div key={d.label} className="text-center">
                          <div className="text-[9px] font-bold uppercase text-muted-foreground">{d.label}</div>
                          <div className={cn(
                            "mx-auto mt-1 flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold",
                            reached ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300" :
                            partial ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300" :
                            "border-border bg-card text-muted-foreground",
                          )}>
                            {d.count}
                          </div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{d.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Weekly Progress */}
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><div className="text-sm font-bold">This Week's Progress</div></div>
                <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-primary hover:bg-primary/10" onClick={() => { setGoalDraft(goal); setGoalOpen(true); }}>Update Daily Goal</Button>
              </div>
              <Card>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="relative h-24 w-24 shrink-0">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-secondary" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-emerald-500" strokeWidth="3" strokeDasharray={`${Math.min(100, (totalQ / Math.max(1, weekTarget)) * 100)} 100`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{totalQ}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold">{totalQ} / {weekTarget} Questions</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{Math.max(0, weekTarget - totalQ)} more to reach your target</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"><Target className="h-3.5 w-3.5" /> Daily goal: {goal}</div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Subject-wise accuracy */}
            <section className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <div className="text-sm font-bold">Subject-wise Accuracy</div>
                <span className="ml-auto text-[10px] text-muted-foreground">This week</span>
              </div>
              <Card>
                <CardContent className="p-4">
                  {subjectAcc === null ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
                  ) : subjectAcc.every((s) => s.total === 0) ? (
                    <div className="space-y-3 opacity-70">
                      {subjectAcc.map((s) => (
                        <div key={s.subject}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                              <span className="font-semibold">{s.subject}</span>
                              <span className="text-muted-foreground">(0/0)</span>
                            </div>
                            <span className="font-bold tabular-nums">—</span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary" />
                        </div>
                      ))}
                      <div className="pt-1 text-center text-[11px] text-muted-foreground">No attempts yet this week — start a quiz to see your accuracy here.</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {subjectAcc.map((s) => (
                        <div key={s.subject}>
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                              <span className="font-semibold">{s.subject}</span>
                              <span className="text-muted-foreground">({s.correct}/{s.total})</span>
                            </div>
                            <span className="font-bold tabular-nums">{s.accuracy}%</span>
                          </div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full transition-all" style={{ width: `${s.accuracy}%`, background: s.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Weekly trend (last 8 weeks) */}
            {(() => {
              const weeks: { label: string; total: number; correct: number }[] = [];
              for (let i = 7; i >= 0; i--) {
                const ws = new Date(weekStart); ws.setDate(ws.getDate() - i * 7);
                const we = new Date(ws); we.setDate(we.getDate() + 7);
                const list = (attempts ?? []).filter((a) => { const d = new Date(a.submitted_at); return d >= ws && d < we; });
                const c = list.reduce((s, a) => s + (a.correct_count ?? 0), 0);
                const w = list.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
                weeks.push({ label: `${ws.getDate()}/${ws.getMonth() + 1}`, total: c + w, correct: c });
              }
              const max = Math.max(1, ...weeks.map((w) => w.total));
              return (
                <section className="mt-6">
                  <div className="mb-2 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /><div className="text-sm font-bold">8-Week Trend</div></div>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex h-32 items-end gap-2">
                        {weeks.map((w, i) => {
                          const h = (w.total / max) * 100;
                          const ch = w.total ? (w.correct / w.total) * h : 0;
                          return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1">
                              <div className="relative flex w-full flex-1 items-end">
                                <div className="w-full rounded-t bg-rose-400/70" style={{ height: `${h}%` }}>
                                  <div className="w-full rounded-t bg-emerald-500" style={{ height: `${w.total ? (ch / h) * 100 : 0}%` }} />
                                </div>
                              </div>
                              <div className="text-[9px] font-semibold text-muted-foreground">{w.label}</div>
                              <div className="text-[10px] font-bold tabular-nums">{w.total}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex justify-center gap-4 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> Correct</span>
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-400/70" /> Wrong</span>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              );
            })()}

            {/* Heatmap */}
            <section className="mt-6">

              <div className="mb-2 flex items-center gap-2"><Flame className="h-4 w-4 text-primary" /><div className="text-sm font-bold">Activity Heatmap</div><span className="ml-auto text-[10px] text-muted-foreground">{monthName}</span></div>
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {heatmap.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-1">
                        {week.map((cell, di) => (
                          <div key={di}
                            title={`${cell.date.toLocaleDateString()} · ${cell.count} questions`}
                            className={cn("h-3.5 w-3.5 rounded-sm transition", heatColor(cell.count))}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    Less
                    <span className="h-2.5 w-2.5 rounded-sm bg-secondary/60" />
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary/65" />
                    <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                    More
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update daily goal</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">How many questions do you want to attempt each day?</p>
            <Input type="number" min={1} max={500} value={goalDraft} onChange={(e) => setGoalDraft(+e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>Cancel</Button>
            <Button onClick={saveGoal} className="bg-gradient-primary">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Stat({ icon: Icon, value, label, color, border }: { icon: React.ComponentType<{ className?: string }>; value: string; label: string; color: string; border: string }) {
  return (
    <Card className={cn("border-t-2", border)}>
      <CardContent className="flex flex-col items-center justify-center p-3 text-center">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-lg font-extrabold", color)}>{value}</span>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
