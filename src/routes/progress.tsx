import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2,
  Flame,
  TrendingUp,
  Calendar,
  Target,
  ChevronLeft,
  ChevronRight,
  Home,
  Brain,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  Trophy,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ComposedChart,
  Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Weekly Progress Report — Neet Buddy" },
      { name: "description", content: "Track your weekly NEET preparation progress, accuracy, and goals." },
      { property: "og:title", content: "Weekly Progress Report — Neet Buddy" },
      { property: "og:description", content: "Track your weekly NEET preparation progress, accuracy, and goals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgressPage,
});

type Attempt = {
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  submitted_at: string;
};

type SubjectAccuracy = {
  subject: string;
  correct: number;
  total: number;
  accuracy: number;
  color: string;
};

type DifficultyAccuracy = {
  difficulty: string;
  correct: number;
  total: number;
  accuracy: number;
  color: string;
};


function startOfWeek(base: Date = new Date()) {
  const d = new Date(base);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d;
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ProgressPage() {
  const { user, profile, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<number>(
    (profile as unknown as { daily_goal?: number } | null)?.daily_goal ?? 20,
  );
  const [subjectAcc, setSubjectAcc] = useState<SubjectAccuracy[] | null>(null);
  const [difficultyAcc, setDifficultyAcc] = useState<DifficultyAccuracy[] | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    const since = new Date();
    since.setDate(since.getDate() - 90);
    since.setHours(0, 0, 0, 0);
    fetch(`/api/progress.php?action=attempts&since=${encodeURIComponent(since.toISOString())}`)
      .then((res) => res.json())
      .then((data) => setAttempts((data?.attempts ?? []) as Attempt[]))
      .catch(() => {
        // Fallback to supabase if present
        supabase
          .from("attempts")
          .select("correct_count,wrong_count,unattempted_count,submitted_at")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .gte("submitted_at", since.toISOString())
          .then(({ data }) => setAttempts((data ?? []) as Attempt[]));
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ws = startOfWeek();
      ws.setDate(ws.getDate() + weekOffset * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);

      const palette: Record<string, string> = {
        Physics: "#0ea5e9",
        Chemistry: "#f97316",
        Biology: "#10b981",
      };
      const diffPalette: Record<string, string> = {
        Easy: "#10b981",
        Medium: "#f59e0b",
        Hard: "#ef4444",
      };

      let subjectsList: Array<{ id: string; name: string; color: string | null }> = [];
      try {
        const subRes = await fetch("/api/progress.php?action=subjects");
        if (subRes.ok) {
          const subData = await subRes.json();
          if (Array.isArray(subData.subjects)) subjectsList = subData.subjects;
        }
      } catch {}
      if (subjectsList.length === 0) {
        const { data: allSubs } = await supabase.from("subjects").select("id,name,color").order("name");
        subjectsList = (allSubs ?? []) as Array<{ id: string; name: string; color: string | null }>;
      }

      const subjBuckets = new Map<string, { correct: number; total: number; color: string }>();
      subjectsList.forEach((s) => {
        subjBuckets.set(s.name, { correct: 0, total: 0, color: s.color ?? palette[s.name] ?? "#6366f1" });
      });
      const diffBuckets = new Map<string, { correct: number; total: number }>([
        ["Easy", { correct: 0, total: 0 }],
        ["Medium", { correct: 0, total: 0 }],
        ["Hard", { correct: 0, total: 0 }],
      ]);

      type BreakdownRow = { kind: string; label: string; correct: number; total: number };
      let rows: BreakdownRow[] = [];
      try {
        const bRes = await fetch(`/api/progress.php?action=breakdown&start=${encodeURIComponent(ws.toISOString())}&end=${encodeURIComponent(we.toISOString())}`);
        if (bRes.ok) {
          const bData = await bRes.json();
          if (Array.isArray(bData.rows)) rows = bData.rows;
        }
      } catch {}

      if (rows.length === 0) {
        const { data: sbRows } = await (
          supabase as unknown as {
            rpc: (
              fn: string,
              args: Record<string, string>,
            ) => Promise<{ data: BreakdownRow[] | null; error: { message: string } | null }>;
          }
        ).rpc("weekly_accuracy_breakdown", { _start: ws.toISOString(), _end: we.toISOString() });
        if (sbRows) rows = sbRows;
      }

      if (cancelled) return;

      for (const r of rows ?? []) {
        if (r.kind === "subject") {
          const prev = subjBuckets.get(r.label);
          subjBuckets.set(r.label, {
            correct: r.correct,
            total: r.total,
            color: prev?.color ?? palette[r.label] ?? "#6366f1",
          });
        } else if (r.kind === "difficulty") {
          const key = r.label.charAt(0).toUpperCase() + r.label.slice(1).toLowerCase();
          diffBuckets.set(key, { correct: r.correct, total: r.total });
        }
      }

      const out: SubjectAccuracy[] = Array.from(subjBuckets.entries()).map(([subject, v]) => ({
        subject,
        correct: v.correct,
        total: v.total,
        accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        color: v.color,
      }));
      const order = ["Physics", "Chemistry", "Biology"];
      out.sort((a, b) => {
        const ai = order.indexOf(a.subject);
        const bi = order.indexOf(b.subject);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return b.total - a.total;
      });
      setSubjectAcc(out);

      const dOrder = ["Easy", "Medium", "Hard"];
      const dOut: DifficultyAccuracy[] = Array.from(diffBuckets.entries())
        .map(([difficulty, v]) => ({
          difficulty,
          correct: v.correct,
          total: v.total,
          accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
          color: diffPalette[difficulty] ?? "#6366f1",
        }))
        .sort((a, b) => {
          const ai = dOrder.indexOf(a.difficulty);
          const bi = dOrder.indexOf(b.difficulty);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return b.total - a.total;
        });
      setDifficultyAcc(dOut);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, weekOffset, attempts]);

  const goal = (profile as unknown as { daily_goal?: number } | null)?.daily_goal ?? 20;
  const weekStart = useMemo(() => {
    const w = startOfWeek();
    w.setDate(w.getDate() + weekOffset * 7);
    return w;
  }, [weekOffset]);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 7);
    return e;
  }, [weekStart]);
  const weekAttempts = useMemo(
    () =>
      (attempts ?? []).filter((a) => {
        const d = new Date(a.submitted_at);
        return d >= weekStart && d < weekEnd;
      }),
    [attempts, weekStart, weekEnd],
  );

  const totalCorrect = weekAttempts.reduce((s, a) => s + (a.correct_count ?? 0), 0);
  const totalWrong = weekAttempts.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
  const totalUnattempted = weekAttempts.reduce((s, a) => s + (a.unattempted_count ?? 0), 0);
  const totalQ = totalCorrect + totalWrong + totalUnattempted;
  const accuracy = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;
  const weekTarget = goal * 7;

  const streak = useMemo(() => {
    if (!attempts) return 0;
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const set = new Set((attempts ?? []).map((a) => dayKey(new Date(a.submitted_at))));
    let s = 0;
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    while (set.has(dayKey(cur))) {
      s++;
      cur.setDate(cur.getDate() - 1);
    }
    return s;
  }, [attempts]);

  const dayLabels = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const perDay = dayLabels.map((label, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const c = (attempts ?? [])
      .filter((a) => {
        const d = new Date(a.submitted_at);
        return d >= day && d < next;
      })
      .reduce((s, a) => s + (a.correct_count ?? 0) + (a.wrong_count ?? 0) + (a.unattempted_count ?? 0), 0);
    return { label, day: day.getDate(), count: c, date: day };
  });

  const monthName = weekStart.toLocaleString("en", { month: "long", year: "numeric" });
  const rangeLabel = `${weekStart.getDate()} – ${new Date(weekEnd.getTime() - 1).getDate()} ${weekStart.toLocaleString("en", { month: "short", year: "numeric" })}`;

  const heatmap = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 83);
    const startDow = start.getDay() || 7;
    start.setDate(start.getDate() - (startDow - 1));
    const counts: Record<string, number> = {};
    (attempts ?? []).forEach((a) => {
      const k = new Date(a.submitted_at).toISOString().slice(0, 10);
      counts[k] =
        (counts[k] ?? 0) + (a.correct_count ?? 0) + (a.wrong_count ?? 0) + (a.unattempted_count ?? 0);
    });
    const weeks: { date: Date; count: number }[][] = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const w: { date: Date; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const k = cursor.toISOString().slice(0, 10);
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

  const testsGiven = weekAttempts.length;
  const studyMinutes = totalQ * 1.5;
  const studyTime = formatDuration(studyMinutes);

  const overallData = [
    { name: "Correct", value: totalCorrect, color: "var(--success)" },
    { name: "Wrong", value: totalWrong, color: "var(--destructive)" },
    { name: "Skipped", value: totalUnattempted, color: "var(--warning)" },
  ];

  const eightWeeks = useMemo(() => {
    const weeks: { label: string; total: number; correct: number; accuracy: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = new Date(weekStart);
      ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      const list = (attempts ?? []).filter((a) => {
        const d = new Date(a.submitted_at);
        return d >= ws && d < we;
      });
      const c = list.reduce((s, a) => s + (a.correct_count ?? 0), 0);
      const w = list.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
      const u = list.reduce((s, a) => s + (a.unattempted_count ?? 0), 0);
      const total = c + w + u;
      weeks.push({ label: `${ws.getDate()}/${ws.getMonth() + 1}`, total, correct: c, accuracy: total ? Math.round((c / total) * 100) : 0 });
    }
    return weeks;
  }, [attempts, weekStart]);

  const scorePredictor = Math.round((accuracy / 100) * 720);

  const saveGoal = async () => {
    if (!user) return;
    const v = Math.max(1, Math.min(500, Math.round(goalDraft)));
    setGoalOpen(false);
    try {
      const res = await fetch("/api/progress.php?action=update_goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_goal: v }),
      });
      if (res.ok) {
        await refresh();
        toast.success(`Daily goal updated to ${v}`);
        return;
      }
    } catch {}
    const { error } = await supabase.from("profiles").update({ daily_goal: v }).eq("id", user.id);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success(`Daily goal updated to ${v}`);
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-4 pb-10">
        {/* Top nav */}
        <div className="-mx-4 mb-6 flex items-center justify-between px-4 pt-4">
          <button
            onClick={() => history.back()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" /> Weekly Progress Report
          </button>
          <Link to="/dashboard" className="rounded-full p-2 text-primary transition hover:bg-primary/10">
            <Home className="h-5 w-5" />
          </Link>
        </div>

        {attempts === null ? (
          <LoadingScreen variant="analysis" fullScreen={false} />
        ) : (
          <>
            {/* Hero header */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-6 text-white shadow-elegant">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.18),transparent_35%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_90%,rgba(255,255,255,0.12),transparent_40%)]" />
              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-bold ring-4 ring-white/10 backdrop-blur-sm">
                    {(profile?.full_name ?? user?.email ?? "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-lg font-bold">{profile?.full_name ?? user?.email}</div>
                    <div className="text-sm text-white/80">NEET {(profile as unknown as { target_year?: number } | null)?.target_year ?? 2027}</div>
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                      Active learner
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-2 backdrop-blur-md md:justify-start">
                    <button
                      onClick={() => setWeekOffset((o) => o - 1)}
                      className="rounded-full p-1.5 transition hover:bg-white/15"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-sm font-semibold">{rangeLabel}</div>
                    <button
                      onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
                      disabled={weekOffset >= 0}
                      className="rounded-full p-1.5 transition hover:bg-white/15 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <HeroPill icon={Flame} value={`${streak} day${streak === 1 ? "" : "s"}`} label="Streak" />
                    <HeroPill icon={Target} value={`${accuracy}%`} label="Accuracy" />
                    <HeroPill icon={Trophy} value={String(totalQ)} label="Questions" />
                  </div>
                </div>
              </div>
            </section>

            {/* Summary stat tiles */}
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              <SummaryTile
                icon={Brain}
                label="Attempted"
                value={String(totalQ)}
                sub={`Goal ${weekTarget}`}
                gradient="from-primary to-primary-glow"
              />
              <SummaryTile
                icon={CheckCircle2}
                label="Correct"
                value={String(totalCorrect)}
                sub={`${totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0}%`}
                gradient="from-emerald-500 to-emerald-400"
              />
              <SummaryTile
                icon={XCircle}
                label="Incorrect"
                value={String(totalWrong)}
                sub={`${totalQ ? Math.round((totalWrong / totalQ) * 100) : 0}%`}
                gradient="from-rose-500 to-rose-400"
              />
              <SummaryTile
                icon={HelpCircle}
                label="Skipped"
                value={String(totalUnattempted)}
                sub={`${totalQ ? Math.round((totalUnattempted / totalQ) * 100) : 0}%`}
                gradient="from-amber-500 to-amber-400"
              />
              <SummaryTile
                icon={Clock}
                label="Study Time"
                value={studyTime}
                sub={`${testsGiven} tests`}
                gradient="from-violet-500 to-violet-400"
                className="col-span-2 sm:col-span-1"
              />
            </section>

            {/* Main grid */}
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              {/* Left / center column */}
              <div className="flex flex-col gap-5 lg:col-span-2">
                {/* Daily Practice Calendar */}
                <Card className="overflow-hidden shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <Calendar className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-base font-bold">Daily Practice Calendar</div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{monthName}</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {perDay.map((d) => {
                        const reached = d.count >= goal;
                        const partial = d.count > 0 && !reached;
                        const isToday =
                          d.date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
                        return (
                          <div key={d.label} className="text-center">
                            <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                              {d.label}
                            </div>
                            <div
                              className={cn(
                                "mx-auto mt-1.5 flex aspect-square w-full max-w-[3.25rem] items-center justify-center rounded-2xl border text-sm font-bold transition",
                                reached
                                  ? "border-emerald-300/60 bg-gradient-to-br from-emerald-500 to-emerald-400 text-white shadow-sm"
                                  : partial
                                    ? "border-amber-300/60 bg-gradient-to-br from-amber-500 to-amber-400 text-white shadow-sm"
                                    : "border-border bg-card text-muted-foreground",
                                isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                              )}
                            >
                              {d.count}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">{d.day}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                        Goal met
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        Partial
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
                        Rest day
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Subject-wise Questions + Accuracy */}
                <div className="grid gap-5 md:grid-cols-2">
                  <Card className="shadow-soft">
                    <CardContent className="p-5">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-base font-bold">Subject-wise Questions</div>
                      </div>
                      <div className="text-xs text-muted-foreground">Distribution this week</div>
                      <div className="mt-4 h-56">
                        {subjectAcc === null ? (
                          <div className="flex h-full items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={subjectAcc} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                              <XAxis
                                dataKey="subject"
                                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "var(--card)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "0.75rem",
                                  fontSize: 12,
                                }}
                                itemStyle={{ color: "var(--foreground)" }}
                                labelStyle={{ color: "var(--muted-foreground)" }}
                              />
                              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                                {subjectAcc.map((s, i) => (
                                  <Cell key={`cell-${i}`} fill={s.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="shadow-soft">
                    <CardContent className="p-5">
                      <div className="mb-1 flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <TrendingUp className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-base font-bold">Subject-wise Accuracy</div>
                      </div>
                      <div className="text-xs text-muted-foreground">Correct vs total attempts</div>
                      <div className="mt-4">
                        {subjectAcc === null ? (
                          <div className="flex h-48 items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          </div>
                        ) : subjectAcc.every((s) => s.total === 0) ? (
                          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                            <div className="rounded-full bg-secondary p-3">
                              <Brain className="h-5 w-5" />
                            </div>
                            No attempts yet this week.
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {subjectAcc.map((s) => (
                              <div key={s.subject} className="flex flex-col items-center text-center">
                                <div className="relative h-20 w-20">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={[
                                          { value: s.accuracy },
                                          { value: 100 - s.accuracy },
                                        ]}
                                        innerRadius={26}
                                        outerRadius={36}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                        stroke="none"
                                      >
                                        <Cell fill={s.color} />
                                        <Cell fill="var(--secondary)" />
                                      </Pie>
                                    </PieChart>
                                  </ResponsiveContainer>
                                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                                    {s.accuracy}%
                                  </div>
                                </div>
                                <div className="mt-1 text-xs font-semibold">{s.subject}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {s.correct}/{s.total}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Difficulty-wise Accuracy */}
                <Card className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-1.5">
                        <Flame className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-base font-bold">Difficulty-wise Accuracy</div>
                    </div>
                    <div className="text-xs text-muted-foreground">How you perform as questions get harder</div>
                    <div className="mt-4">
                      {difficultyAcc === null ? (
                        <div className="flex h-32 items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : difficultyAcc.every((d) => d.total === 0) ? (
                        <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                          <div className="rounded-full bg-secondary p-3">
                            <Brain className="h-5 w-5" />
                          </div>
                          No attempts yet this week.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {difficultyAcc.map((d) => (
                            <div key={d.difficulty}>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span className="font-semibold">{d.difficulty}</span>
                                <span className="text-muted-foreground">
                                  {d.correct}/{d.total} · {d.accuracy}%
                                </span>
                              </div>
                              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${d.total ? d.accuracy : 0}%`, background: d.color }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>



                {/* 8-Week Comparison */}
                <Card className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-1.5">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-base font-bold">8-Week Comparison</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Questions attempted vs accuracy</div>
                    <div className="mt-4 h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={eightWeeks} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="accGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "0.75rem",
                              fontSize: 12,
                            }}
                            itemStyle={{ color: "var(--foreground)" }}
                            labelStyle={{ color: "var(--muted-foreground)" }}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="total"
                            radius={[6, 6, 0, 0]}
                            fill="var(--primary)"
                            fillOpacity={0.7}
                          />
                          <Area
                            yAxisId="right"
                            type="monotone"
                            dataKey="accuracy"
                            stroke="var(--success)"
                            strokeWidth={2.5}
                            fill="url(#accGradient)"
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="accuracy"
                            stroke="var(--success)"
                            strokeWidth={0}
                            dot={{ r: 3, fill: "var(--success)", strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-5">
                {/* Weekly Goal */}
                <Card className="overflow-hidden shadow-soft">
                  <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <Target className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-base font-bold">Weekly Goal</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full text-xs text-primary hover:bg-primary/10"
                        onClick={() => {
                          setGoalDraft(goal);
                          setGoalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                    <div className="relative mx-auto mb-4 h-36 w-36">
                      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-secondary" strokeWidth="3" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.9"
                          fill="none"
                          className="stroke-primary"
                          strokeWidth="3"
                          strokeDasharray={`${Math.min(100, (totalQ / Math.max(1, weekTarget)) * 100)} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold">{totalQ}</span>
                        <span className="text-[10px] font-medium text-muted-foreground">/ {weekTarget}</span>
                      </div>
                    </div>
                    <div className="text-center text-sm">
                      <span className="font-semibold text-foreground">{Math.max(0, weekTarget - totalQ)}</span>
                      <span className="text-muted-foreground"> more to reach your target</span>
                    </div>
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ArrowUpRight className="h-3.5 w-3.5 text-success" />
                      <span className="text-success">{Math.max(0, totalQ - Math.max(0, weekTarget - totalQ))}</span>
                      <span>vs last week</span>
                    </div>
                    <div className="mt-4 text-center text-xs text-muted-foreground">
                      Daily goal: <span className="font-semibold text-foreground">{goal}</span> questions
                    </div>
                  </div>
                </Card>

                {/* Overall Performance */}
                <Card className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-1.5">
                        <Trophy className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-base font-bold">Overall Performance</div>
                    </div>
                    <div className="text-xs text-muted-foreground">This week&apos;s breakdown</div>
                    <div className="mt-4 h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={overallData}
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {overallData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 space-y-2">
                      {overallData.map((d) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                            {d.name}
                          </span>
                          <span className="font-semibold tabular-nums">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Score Predictor */}
                <Card className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="rounded-lg bg-primary/10 p-1.5">
                        <Brain className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-base font-bold">Score Predictor</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Projected NEET score</div>
                    <div className="mt-5 flex flex-col items-center">
                      <div className="relative h-32 w-56">
                        <svg viewBox="0 0 200 110" className="h-full w-full">
                          <defs>
                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="var(--destructive)" />
                              <stop offset="50%" stopColor="var(--warning)" />
                              <stop offset="100%" stopColor="var(--success)" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M 20 100 A 80 80 0 0 1 180 100"
                            fill="none"
                            stroke="var(--secondary)"
                            strokeWidth="18"
                            strokeLinecap="round"
                          />
                          <path
                            d="M 20 100 A 80 80 0 0 1 180 100"
                            fill="none"
                            stroke="url(#gaugeGradient)"
                            strokeWidth="18"
                            strokeLinecap="round"
                            strokeDasharray={`${(scorePredictor / 720) * 251} 251`}
                          />
                          <text x="100" y="95" textAnchor="middle" className="fill-foreground text-2xl font-bold">
                            {scorePredictor}
                          </text>
                          <text x="100" y="75" textAnchor="middle" className="fill-muted-foreground text-[10px] font-medium">
                            / 720
                          </text>
                        </svg>
                      </div>
                      <div className="mt-3 text-center text-xs text-muted-foreground">
                        Based on {accuracy}% accuracy across {totalQ} questions
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Activity Heatmap */}
                <Card className="shadow-soft">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          <Flame className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-base font-bold">Activity Heatmap</div>
                      </div>
                      <span className="text-xs text-muted-foreground">{monthName}</span>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {heatmap.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-1">
                          {week.map((cell, di) => (
                            <div
                              key={di}
                              title={`${cell.date.toLocaleDateString()} · ${cell.count} questions`}
                              className={cn("h-3.5 w-3.5 rounded-sm transition", heatColor(cell.count))}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>Less</span>
                      <span className="h-2.5 w-2.5 rounded-sm bg-secondary/60" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary/20" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary/40" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary/65" />
                      <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
                      <span>More</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update daily goal</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">How many questions do you want to attempt each day?</p>
            <Input
              type="number"
              min={1}
              max={500}
              value={goalDraft}
              onChange={(e) => setGoalDraft(+e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGoalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveGoal} className="bg-gradient-primary">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function HeroPill({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-xl bg-white/15 px-3 py-2 backdrop-blur-sm transition hover:bg-white/20">
      <Icon className="h-4 w-4 text-white/90" />
      <div>
        <div className="text-xs font-bold">{value}</div>
        <div className="text-[10px] text-white/75">{label}</div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  gradient: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-0 shadow-soft transition hover:-translate-y-1 hover:shadow-elegant",
        className,
      )}
    >
      <div className={cn("absolute left-0 top-0 h-full w-1 bg-gradient-to-b", gradient)} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-bold tracking-tight">{value}</div>
            <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">{sub}</div>
          </div>
          <div className={cn("rounded-xl bg-gradient-to-br p-2 text-white shadow-sm", gradient)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
