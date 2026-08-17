import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, ArrowRight, CalendarDays, Flame,
  Atom, FlaskConical, Leaf, Dna, Brain,
  FileText, BookMarked, RefreshCw, TrendingUp, Trophy,
  Gift, MessageSquare, Users, Route as RouteIcon, Target,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { TrialBanner } from "@/components/dashboard/trial-banner";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { startDppAttempt } from "@/lib/dpp-gate.functions";

type Test = { id: string; title: string; type: string; difficulty: string; duration_min: number; total_questions: number };

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Neet Buddy" }] }),
  component: Dashboard,
});

const SUBJECTS = [
  { name: "Physics", icon: Atom, tint: "from-sky-500 to-blue-600", ring: "ring-sky-400/30" },
  { name: "Chemistry", icon: FlaskConical, tint: "from-orange-500 to-rose-600", ring: "ring-orange-400/30" },
  { name: "Biology", icon: Leaf, tint: "from-emerald-500 to-teal-600", ring: "ring-emerald-400/30" },
];
void Dna;

function Dashboard() {
  const { user, profile, isAdmin, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [daily, setDaily] = useState<Test | null | undefined>(undefined);
  const [streak, setStreak] = useState<number>(0);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => { if (user) refresh(); }, [user?.id]);
  useEffect(() => {
    supabase.from("tests").select("id,title,type,difficulty,duration_min,total_questions")
      .eq("type", "daily").order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setDaily((data as Test | null) ?? null));
  }, []);

  // Compute current daily streak from completed attempts
  useEffect(() => {
    if (!user) return;
    const since = new Date(); since.setDate(since.getDate() - 60); since.setHours(0, 0, 0, 0);
    supabase
      .from("attempts")
      .select("submitted_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("submitted_at", since.toISOString())
      .then(({ data }) => {
        const days = new Set(
          (data ?? [])
            .map((a) => a.submitted_at)
            .filter((s): s is string => !!s)
            .map((s) => new Date(s).toISOString().slice(0, 10)),
        );
        let s = 0;
        const cur = new Date(); cur.setHours(0, 0, 0, 0);
        // Allow today missing but streak continues from yesterday
        if (!days.has(cur.toISOString().slice(0, 10))) {
          cur.setDate(cur.getDate() - 1);
        }
        while (days.has(cur.toISOString().slice(0, 10))) {
          s++;
          cur.setDate(cur.getDate() - 1);
        }
        setStreak(s);
      });
  }, [user?.id]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Aspirant";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-5xl">
      {/* Top status strip — matches the 3-column symmetry of the Quick
          Practice grid below on tablet/desktop. */}
      <div className="-mt-2 mb-2 grid grid-cols-3 gap-1.5 sm:gap-3">
        <StatPill icon={CalendarDays} label="NEET" value="2027" />
        <Link to="/leaderboard" className="block"><StatPill icon={Flame} label="Streak" value={`${streak}d`} /></Link>
        <Link to="/leaderboard" className="block"><StatPill icon={Trophy} label="XP" value={String((profile as unknown as { xp_total?: number } | null)?.xp_total ?? 0)} /></Link>
      </div>

      {/* Quick Practice */}
      <Section title="Quick Practice" first>
        <div className="grid grid-cols-3 gap-3">
          {SUBJECTS.map((s) => (
            <Link key={s.name} to="/subjects/$subject" params={{ subject: s.name }} className="group">
              <div
                className={`flex h-20 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br ${s.tint} px-3 shadow-soft ring-1 ${s.ring} transition-transform group-hover:-translate-y-0.5 sm:h-24`}
              >
                <s.icon className="h-6 w-6 text-white sm:h-7 sm:w-7" strokeWidth={1.8} />
                <span className="truncate text-sm font-bold text-white sm:text-base">{s.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Trial / subscription status — placed under Quick Practice */}
      <div className="mt-4">
        <TrialBanner />
      </div>

      {/* Daily DPP — with an inline "View past DPP" action inside the tile */}
      <Section title="Daily DPP">
        <DailyDppTile testId={daily?.id ?? null} streak={streak} today={today} />
      </Section>

      {/* Mentorship Program — moved directly under Daily DPP */}
      <Section title="Mentorship Program">
        <ToolCard
          to="/mentorship"
          title="1-on-1 Mentorship"
          subtitle="Personal mentor on WhatsApp · Plans from ₹1,999 · Explore selections & plans"
          icon={GraduationCap}
          tint="from-amber-500 via-orange-500 to-rose-600"
          badge="NEW"
        />
      </Section>

      {/* Arena + Mock Test side-by-side — compact tiles that fit two-across on mobile */}
      <Section title="Compete & Test">
        <div className="grid grid-cols-2 gap-3">
          <SmallTool
            to="/arena"
            title="Arena"
            subtitle="Contests & Battles"
            icon={Trophy}
            tint="from-amber-500 to-orange-600"
            badge="LIVE"
            tall
          />
          <SmallTool
            to="/mocks"
            title="Mock Tests"
            subtitle="Full-length NEET mocks"
            icon={Brain}
            tint="from-violet-500 to-indigo-600"
            tall
          />
        </div>
      </Section>

      {/* Study Tools — distinct per-feature accent colors */}
      <Section title="Study Tools">
        <div className="grid gap-3 md:grid-cols-2">
          <ToolCard
            to="/study-essentials"
            title="Study Essentials"
            subtitle="Mind maps · Formula sheets · Short notes · Flashcards · NCERT highlights & key points — chapter-wise"
            icon={GraduationCap}
            tint="from-blue-500 via-indigo-500 to-purple-600"
          />

          {/* Short Notes, Flashcards, NCERT Key Points and Highlighted NCERT
              are now accessed inside Study Essentials (chapter-wise tabs). */}

          <ToolCard
            to="/improvement"
            title="Improvement Zone"
            subtitle="My Mistakes · Bookmarks · Performance Analysis"
            icon={RefreshCw}
            tint="from-red-500 to-rose-600"
          />

          <div className="grid grid-cols-2 grid-rows-2 gap-3 md:col-span-2">
            <div className="row-span-2">
              <SmallTool to="/generate" title="Generate Test" subtitle="Custom DPP wizard" icon={FileText} bonus={5} tint="from-orange-500 to-rose-600" />
            </div>
            <SmallTool to="/neetlab" title="NEETLab" subtitle="3D simulations & PYQs" icon={BookMarked} tint="from-amber-500 to-yellow-600" />
            <SmallTool to="/ai-path" title="AI Path" subtitle="7-day personalized plan" icon={RouteIcon} bonus={45} tint="from-fuchsia-500 to-purple-600" />
          </div>

          <ToolCard
            to="/score-predictor"
            title="Score Predictor"
            subtitle="AI NEET score & rank forecast"
            icon={Target}
            tint="from-red-500 to-orange-600"
            bonus={25}
          />

          <ToolCard
            to="/progress"
            title="Weekly Progress Report"
            subtitle="Parent dashboard analytics · trends & charts"
            icon={TrendingUp}
            tint="from-teal-500 to-emerald-600"
          />
        </div>
      </Section>



      {/* More — Community, Refer & Earn, Feedback */}
      <Section title="More">
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
      </Section>



      {isAdmin && (
        <Section title="Admin">
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
        </Section>
      )}
      </div>
    </PageShell>

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

function ToolCard({ to, params, title, subtitle, icon: Icon, bonus, tint, badge }: {
  to: string; params?: Record<string, string>; title: string; subtitle: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  bonus?: number; tint?: string; badge?: string;
}) {
  const grad = tint ?? "from-primary to-blue-600";
  const s = tintStyles(tint);
  return (
    <Link to={to as never} params={params as never} className="block">
      <div className={`relative overflow-hidden rounded-2xl border ${s.border} ${s.bg} p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-bold uppercase tracking-wide text-foreground">{title}</div>
              {badge && <BadgePill text={badge} />}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
            {bonus !== undefined && <BonusPill amount={bonus} className={`mt-2 ${s.pill}`} />}
          </div>
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-md`}>
            <Icon className="h-7 w-7" strokeWidth={1.6} />
          </div>
        </div>
      </div>
    </Link>
  );
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

