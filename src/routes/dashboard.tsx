import { publicMediaAsset } from "@/lib/media-assets";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, ArrowRight, CalendarDays, Flame, Target as TargetIcon,
  Atom, FlaskConical, Leaf, Brain, Sparkles,
  RefreshCw, Trophy, Gift, MessageSquare, Users,
  GraduationCap, BarChart3, Bot, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getDashboardDailyTest,
  getDashboardSubjectCounts,
  getDashboardAttempts,
  getDashboardMistakes,
} from "@/lib/dashboard-mysql.functions";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import { BannerCarousel } from "@/components/dashboard/banner-carousel";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { startDppAttempt } from "@/lib/dpp-gate.functions";

type Test = { id: string; title: string; type: string; difficulty: string; duration_min: number; total_questions: number };

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Neet Buddy" },
      { name: "description", content: "Your NEET command center: daily progress, quick practice, performance analytics and personalized recommendations." },
      { property: "og:title", content: "Dashboard — Neet Buddy" },
      { property: "og:description", content: "Track questions solved, study time, accuracy and weekly performance in one place." },
    ],
  }),
  component: Dashboard,
});

const SUBJECTS = [
  { name: "Physics", icon: Atom, tint: "from-sky-500 to-blue-600", ring: "ring-sky-400/30", dot: "bg-sky-500" },
  { name: "Chemistry", icon: FlaskConical, tint: "from-orange-500 to-rose-600", ring: "ring-orange-400/30", dot: "bg-orange-500" },
  { name: "Biology", icon: Leaf, tint: "from-emerald-500 to-teal-600", ring: "ring-emerald-400/30", dot: "bg-emerald-500" },
];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type AttemptRow = {
  submitted_at: string | null;
  score: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  unattempted_count: number | null;
  time_taken_sec: number | null;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function Dashboard() {
  const { user, profile, isAdmin, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [daily, setDaily] = useState<Test | null | undefined>(undefined);
  const [streak, setStreak] = useState<number>(0);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [qCounts, setQCounts] = useState<Record<string, number>>({});
  const [weakChapters, setWeakChapters] = useState<number>(0);
  const [mistakes, setMistakes] = useState<number>(0);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => { if (user) refresh(); }, [user?.id]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getDashboardDailyTest();
        setDaily((data as Test | null) ?? null);
      } catch {
        setDaily(null);
      }
    })();
  }, []);

  // Real question bank counts per subject for the Quick Practice tiles.
  useEffect(() => {
    void (async () => {
      try {
        setQCounts(await getDashboardSubjectCounts());
      } catch {
        /* leave counts empty */
      }
    })();
  }, []);

  // Real attempt history (last 60 days) powers streak, today's progress and weekly charts.
  useEffect(() => {
    if (!user) return;
    const since = new Date(); since.setDate(since.getDate() - 60); since.setHours(0, 0, 0, 0);
    void (async () => {
      try {
        const rows = (await getDashboardAttempts({
          data: { userId: user.id, sinceIso: since.toISOString() },
        })) as AttemptRow[];
        setAttempts(rows);
        const days = new Set(rows.map((a) => a.submitted_at).filter((s): s is string => !!s).map((s) => dayKey(new Date(s))));
        let s = 0;
        const cur = new Date(); cur.setHours(0, 0, 0, 0);
        if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
        while (days.has(dayKey(cur))) { s++; cur.setDate(cur.getDate() - 1); }
        setStreak(s);
      } catch {
        setAttempts([]);
      }
    })();
  }, [user?.id]);

  // Real mistake bank for the recommendation cards.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const res = await getDashboardMistakes({ data: { userId: user.id } });
        setMistakes(res.mistakes);
        setWeakChapters(res.weakChapters);
      } catch {
        /* keep zeros */
      }
    })();
  }, [user?.id]);

  const stats = useMemo(() => {
    const todayStr = dayKey(new Date());
    const today = attempts.filter((a) => a.submitted_at && dayKey(new Date(a.submitted_at)) === todayStr);
    const sum = (rows: AttemptRow[], k: keyof AttemptRow) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    const correct = sum(today, "correct_count");
    const wrong = sum(today, "wrong_count");
    const attempted = correct + wrong;
    const seconds = sum(today, "time_taken_sec");
    const goal = (profile as unknown as { daily_goal?: number } | null)?.daily_goal || 150;

    // last 7 days (oldest → newest)
    const week: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = dayKey(d);
      const rows = attempts.filter((a) => a.submitted_at && dayKey(new Date(a.submitted_at)) === key);
      week.push({ label: DAY_LABELS[d.getDay()] ?? "", value: sum(rows, "correct_count") + sum(rows, "wrong_count") });
    }
    const weekRows = attempts.filter((a) => {
      if (!a.submitted_at) return false;
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6);
      return new Date(a.submitted_at) >= d;
    });
    const wCorrect = sum(weekRows, "correct_count");
    const wWrong = sum(weekRows, "wrong_count");
    const wSkipped = sum(weekRows, "unattempted_count");
    const wScore = sum(weekRows, "score");

    return {
      correct, wrong, attempted, seconds, goal,
      accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
      completion: goal ? Math.min(100, Math.round((attempted / goal) * 100)) : 0,
      week, wCorrect, wWrong, wSkipped, wScore,
      weekTotal: wCorrect + wWrong + wSkipped,
    };
  }, [attempts, profile]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Aspirant";
  const today = new Date().toISOString().slice(0, 10);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const targetYear = (profile as unknown as { target_year?: number } | null)?.target_year ?? 2027;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1700px]">

        {/* ── Greeting hero ─────────────────────────────────────────── */}
        <div className="relative isolate overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-sky-500/15 p-4 shadow-soft sm:p-7">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px] text-foreground/40 [mask-image:linear-gradient(to_bottom_right,black,transparent_70%)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 animate-pulse rounded-full bg-gradient-to-br from-primary to-sky-400 opacity-25 blur-3xl [animation-duration:7s]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 animate-pulse rounded-full bg-gradient-to-br from-sky-400 to-violet-500 opacity-20 blur-3xl [animation-duration:9s]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-40 dark:via-white/[0.05]"
          />
          <div className="relative z-10 max-w-[58%] sm:max-w-[56%]">
            <div className="text-sm font-semibold text-muted-foreground">{greeting}, {firstName}! 👋</div>
            <h1 className="mt-2 text-[clamp(1.3rem,5.6vw,1.6rem)] font-extrabold leading-tight tracking-tight sm:text-3xl">
              Let&apos;s make today count towards your{" "}
              <span className="text-primary">NEET {targetYear} dream</span>.
            </h1>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span className="italic">&ldquo;Discipline today, success tomorrow.&rdquo;</span>
            </div>
            <Link
              to="/leaderboard"
              className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-border bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur"
            >
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-bold">{streak}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Day Streak</span>
              <span className="ml-1 border-l border-border pl-2 text-[11px] font-semibold text-primary">View leaderboard</span>
            </Link>
          </div>
          <img
            src={publicMediaAsset("illustrations/study-desk.png")}
            alt="Student studying at a desk"
            loading="lazy"
            className="pointer-events-none absolute bottom-0 right-0 z-0 h-[85%] max-h-[180px] w-[38%] max-w-[180px] select-none object-contain object-bottom object-right drop-shadow-[0_12px_28px_rgba(0,0,0,0.22)] sm:h-[92%] sm:max-h-[240px] sm:w-[42%] sm:max-w-[280px] lg:h-[96%] lg:max-h-[270px] lg:w-[45%] lg:max-w-[340px]"
          />
        </div>

        {/* ── Banner plot (admin managed, 8:3 like the hero card) ───── */}
        <BannerCarousel />

        {/* ── Today's progress ──────────────────────────────────────── */}
        <div className="mt-4 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-slate-100 shadow-elegant">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold">Today&apos;s Progress</div>
            <div className="flex items-center gap-4">
              <Link
                to="/daily-checklist"
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 transition-colors hover:text-sky-200"
              >
                Prepare to-do list
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/progress"
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 transition-colors hover:text-white"
              >
                View All
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 sm:gap-8">
            <ProgressRing percent={stats.completion} />
            <div className="grid flex-1 grid-cols-2 divide-x divide-white/10 text-center">
              <MetricCell icon={CheckCircle2} label="Questions Solved" value={`${stats.attempted}`} suffix={`/ ${stats.goal}`} />
              <MetricCell icon={TargetIcon} label="Accuracy" value={`${stats.accuracy}%`} />
            </div>
          </div>
        </div>

        {/* ── Quick Practice ───────────────────────────────────────── */}
        <SectionHead title="Quick Practice" actionLabel="Custom Practice" to="/generate" />
        <div className="grid grid-cols-3 gap-3">
          {SUBJECTS.map((s) => (
            <Link key={s.name} to="/subjects/$subject" params={{ subject: s.name }} className="group">
              <div className={`flex h-24 flex-col justify-center gap-1 rounded-2xl bg-gradient-to-br ${s.tint} px-3 shadow-soft ring-1 ${s.ring} transition-transform group-hover:-translate-y-0.5 sm:h-28 sm:px-4`}>
                <s.icon className="h-5 w-5 text-white sm:h-6 sm:w-6" strokeWidth={1.8} />
                <span className="truncate text-sm font-bold text-white sm:text-base">{s.name}</span>
                <span className="text-[11px] font-medium text-white/85">
                  {qCounts[s.name] ? `${qCounts[s.name]}+ Qs` : "Loading…"}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4"><TrialBanner /></div>

        {/* ── Continue your journey ────────────────────────────────── */}
        <SectionHead title="Continue Your Journey" actionLabel="View All" to="/daily" />
        <DailyDppTile testId={daily?.id ?? null} streak={streak} today={today} />
        <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-sky-500 transition-all" style={{ width: `${stats.completion}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.max(0, stats.goal - stats.attempted)} Qs left today</span>
            <span>Today&apos;s Goal: {stats.goal} Qs</span>
          </div>
        </div>

        {/* ── Performance overview ─────────────────────────────────── */}
        <SectionHead title="Performance Overview" actionLabel="Weekly Progress Report" to="/progress" />
        <div className="grid gap-4 rounded-3xl border border-border bg-card p-5 shadow-soft md:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">This Week</div>
            <div className="mt-4 flex items-end gap-2">
              {stats.week.map((d, i) => {
                const max = Math.max(1, ...stats.week.map((w) => w.value));
                const h = Math.round(Math.max(6, (d.value / max) * 104));
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">{d.value}</span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-primary transition-all"
                      style={{ height: `${h}px` }}
                      title={`${d.value} questions`}
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-5 border-border md:border-l md:pl-6">
            <DonutChart
              total={stats.weekTotal}
              centerLabel="Qs this week"
              slices={[
                { value: stats.wCorrect, color: "#10b981" },
                { value: stats.wWrong, color: "#f43f5e" },
                { value: stats.wSkipped, color: "#94a3b8" },
              ]}
            />
            <div className="space-y-2 text-sm">
              <LegendRow color="bg-emerald-500" label="Correct" value={stats.wCorrect} />
              <LegendRow color="bg-rose-500" label="Incorrect" value={stats.wWrong} />
              <LegendRow color="bg-slate-400" label="Skipped" value={stats.wSkipped} />
              <div className="pt-1 text-xs font-semibold text-muted-foreground">Score this week: {stats.wScore}</div>
            </div>
          </div>
        </div>

        {/* ── Recommended for you ──────────────────────────────────── */}
        <SectionHead title="Recommended for You" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RecoCard
            to="/improvement" icon={BarChart3} accent="rose"
            title="Weak Chapters"
            body={weakChapters ? `${weakChapters} chapters need more practice` : "Practice to find your weak chapters"}
            cta="Improve Now"
          />
          <RecoCard
            to="/mocks" icon={Brain} accent="violet"
            title="Mock Test" body="Full-length NEET mock tests" cta="Attempt Now"
          />
          <RecoCard
            to="/mistakes" icon={RefreshCw} accent="amber"
            title="Previous Mistakes"
            body={mistakes ? `Revise ${mistakes} mistakes from past tests` : "No mistakes saved yet"}
            cta="Revise Now"
          />
          <RecoCard
            to="/ai-path" icon={Bot} accent="sky"
            title="AI Tutor" body="Get instant help & explanations" cta="Ask Now"
          />
        </div>

        {/* ── Mentorship banner ────────────────────────────────────── */}
        <Link to="/mentorship" className="mt-4 block">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-4 shadow-elegant transition-transform hover:-translate-y-0.5">
            <div className="min-w-0 text-white">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                <span className="text-sm font-bold">1-ON-1 Mentorship</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">NEW</span>
              </div>
              <div className="mt-1 truncate text-xs text-white/85">Personal mentor on WhatsApp · Plans from ₹1,999</div>
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-indigo-700">
              Explore Plans <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>


        {/* ── More ─────────────────────────────────────────────────── */}
        <SectionHead title="More" />
        <div className="grid grid-cols-2 gap-3">
          <SmallTool to="/community" title="Our Community" subtitle="WhatsApp & Telegram channels" icon={Users} tint="from-green-500 to-emerald-600" tall />
          <SmallTool to="/referrals" title="Refer & Earn" subtitle="Invite friends to Neet Buddy" icon={Gift} tint="from-yellow-500 to-amber-600" tall />
          <Link to="/feedback" className="col-span-2 block h-full">
            <div className="flex h-full min-h-[88px] items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft transition-transform hover:-translate-y-0.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-sm">
                <MessageSquare className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight text-foreground">Feedback</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Tell us what to improve</div>
              </div>
            </div>
          </Link>
        </div>

        {isAdmin && (
          <div className="mt-6">
            <Card className="border-primary/30 bg-gradient-primary text-primary-foreground shadow-elegant">
              <CardContent className="flex items-center justify-between gap-3 p-5">
                <div>
                  <div className="text-xs uppercase tracking-widest opacity-80">Admin</div>
                  <div className="mt-1 text-base font-semibold">Manage tests, contests & questions</div>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/admin">Open <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="h-6" />
      </div>
    </PageShell>
  );
}

/* ── Presentational helpers ────────────────────────────────────── */

function SectionHead({ title, actionLabel, to }: { title: string; actionLabel?: string; to?: string }) {
  return (
    <div className="mb-3 mt-6 flex items-end justify-between">
      <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
      {actionLabel && to && (
        <Link to={to as never} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#3b82f6" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-extrabold">{percent}%</div>
    </div>
  );
}

function MetricCell({ icon: Icon, label, value, suffix }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; suffix?: string;
}) {
  return (
    <div className="px-1.5">
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
        <Icon className="h-4 w-4 text-sky-300" />
      </div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{label}</div>
      <div className="mt-1 text-sm font-bold">
        {value} {suffix && <span className="text-xs font-medium text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

function DonutChart({ slices, total, centerLabel }: {
  slices: { value: number; color: string }[]; total: number; centerLabel: string;
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const sum = slices.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="12" />
        {sum > 0 && slices.map((s, i) => {
          const len = (s.value / sum) * c;
          const el = (
            <circle
              key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-lg font-extrabold leading-none">{total}</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{centerLabel}</div>
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="min-w-[70px] text-xs font-semibold text-foreground">{label}</span>
      <span className="text-xs font-bold text-muted-foreground">{value}</span>
    </div>
  );
}

const RECO_ACCENTS: Record<string, { wrap: string; icon: string; cta: string }> = {
  rose: { wrap: "border-rose-500/25 bg-rose-500/10", icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400", cta: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  violet: { wrap: "border-violet-500/25 bg-violet-500/10", icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400", cta: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  amber: { wrap: "border-amber-500/25 bg-amber-500/10", icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400", cta: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  sky: { wrap: "border-sky-500/25 bg-sky-500/10", icon: "bg-sky-500/15 text-sky-600 dark:text-sky-400", cta: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
};

function RecoCard({ to, icon: Icon, title, body, cta, accent }: {
  to: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string; body: string; cta: string; accent: keyof typeof RECO_ACCENTS | string;
}) {
  const a = RECO_ACCENTS[accent] ?? RECO_ACCENTS["sky"]!;
  return (
    <Link to={to as never} className="block h-full">
      <div className={`flex h-full flex-col rounded-2xl border p-4 shadow-soft transition-transform hover:-translate-y-0.5 ${a.wrap}`}>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${a.icon}`}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <div className="mt-3 text-sm font-bold leading-tight text-foreground">{title}</div>
        <div className="mt-1 flex-1 text-xs leading-snug text-muted-foreground">{body}</div>
        <span className={`mt-3 inline-flex justify-center rounded-lg px-3 py-2 text-xs font-bold ${a.cta}`}>{cta}</span>
      </div>
    </Link>
  );
}

function DailyDppTile({ testId, streak, today }: { testId: string | null; streak: number; today: string }) {
  const tint = "from-sky-500 to-blue-600";
  const s = tintStyles(tint);
  const nav = useNavigate();
  const startGate = useServerFn(startDppAttempt);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  // Daily DPP always asks Quiz mode vs CBT mode before launching.
  async function start(mode: QuizMode) {
    if (!testId || busy) return;
    setBusy(true);
    try {
      await startGate({ data: { test_id: testId } });
      setPick(false);
      nav({ to: "/quiz/$testId", params: { testId }, search: { mode } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start today's DPP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${s.border} ${s.bg} shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant`}>
      {testId ? (
        <button type="button" onClick={() => setPick(true)} className="block w-full p-5 text-left">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[15px] font-bold uppercase tracking-wide text-foreground">Daily DPP</div>
              <div className="mt-1 text-sm text-muted-foreground">20-min NEET practice · {streak}-day streak · {today}</div>
            </div>
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-md`}>
              <CalendarDays className="h-7 w-7" strokeWidth={1.6} />
            </div>
          </div>
        </button>
      ) : (
        <Link to="/daily" className="block p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[15px] font-bold uppercase tracking-wide text-foreground">Daily DPP</div>
              <div className="mt-1 text-sm text-muted-foreground">20-min NEET practice · {streak}-day streak · {today}</div>
            </div>
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-md`}>
              <CalendarDays className="h-7 w-7" strokeWidth={1.6} />
            </div>
          </div>
        </Link>
      )}
      <Link
        to="/daily"
        className="flex items-center justify-between gap-2 border-t border-border/70 bg-background/40 px-5 py-2.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <span>View all past DPP</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <QuizModePicker
        open={pick}
        subtitle="Today's Daily DPP"
        onClose={() => setPick(false)}
        onPick={start}
        busy={busy}
      />
    </div>
  );
}

function Section({ title, children, first }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <section className={first ? "mt-4" : "mt-6"}>
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function StatPill({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1.5 shadow-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-[11px] font-bold">{value}</div>
      </div>
    </div>
  );
}

// Map gradient tints to subtle tile backgrounds + border + bonus pill colors (works in light & dark)
function tintStyles(tint?: string) {
  const t = tint ?? "from-primary to-blue-600";
  // Extract the "from-xxx-500" base color name
  const m = t.match(/from-([a-z]+)-\d+/);
  const c = m?.[1] ?? "primary";
  if (c === "primary") {
    return {
      bg: "bg-gradient-to-br from-primary/15 via-card to-primary/25",
      border: "border-primary/40 hover:border-primary/70",
      pill: "bg-primary/20 text-primary",
    };
  }
  return {
    bg: `bg-gradient-to-br from-${c}-500/20 via-card to-${c}-500/25 dark:from-${c}-500/25 dark:to-${c}-500/35`,
    border: `border-${c}-500/40 hover:border-${c}-500/70`,
    pill: `bg-${c}-500/20 text-${c}-700 dark:text-${c}-300`,
  };
}

function SmallTool({ to, title, subtitle, icon: Icon, bonus, tall, tint, badge, onClick }: {
  to: string; title: string; subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  bonus?: number; tall?: boolean; tint?: string; badge?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const grad = tint ?? "from-primary to-blue-600";
  const s = tintStyles(tint);
  return (
    <Link to={to as never} onClick={onClick} className="block h-full">
      <div className={`flex h-full ${tall ? "min-h-[132px]" : ""} flex-col justify-between rounded-2xl border ${s.border} ${s.bg} p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="whitespace-normal break-words text-sm font-bold uppercase tracking-wide leading-tight text-foreground">{title}</div>
            {badge && <div className="mt-1"><BadgePill text={badge} /></div>}
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${grad} text-white shadow-sm`}>
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </div>
        </div>
        <div>
          <div className="mt-2 whitespace-normal break-words text-xs leading-snug text-muted-foreground">{subtitle}</div>
          {bonus !== undefined && <BonusPill amount={bonus} className={`mt-2 ${s.pill}`} />}
        </div>
      </div>
    </Link>
  );
}

function BadgePill({ text }: { text: string }) {
  const isLive = text.toUpperCase() === "LIVE";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
      isLive
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground"
    }`}>
      {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {text}
    </span>
  );
}



function BonusPill(_: { amount?: number; className?: string }) {
  // Bonus counts intentionally hidden from tiles per product decision.
  return null;
}

