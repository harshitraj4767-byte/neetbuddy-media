import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboardData } from "@/lib/leaderboard.functions";
import {
  Loader2, Trophy, Flame, Target, Calendar, Award, BookmarkCheck,
  TrendingUp, LogOut, Save, Sparkles, Smile, Check, ArrowRight,
} from "lucide-react";
import { NEETIQ_AVATARS } from "@/lib/neetiq-avatars";
import { avatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { DR_VANSHU_IMG, startAppTour } from "@/components/onboarding-tour";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [
    { title: "Profile — Neet Buddy" },
    { name: "description", content: "Your XP, level, streak, badges, daily goal and competitive profile card." },
  ] }),
  component: ProfilePage,
});

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  xp_total: number;
  daily_goal: number;
  target_year: number | null;
  wallet_balance: number;
  created_at: string;
};

function levelFromXp(xp: number) {
  // Simple level curve: 250 XP per level.
  const level = Math.max(1, Math.floor(xp / 250) + 1);
  const inLevel = xp % 250;
  return { level, inLevel, toNext: 250 - inLevel, pct: (inLevel / 250) * 100 };
}

function streakFromDates(dates: string[]) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let streak = 0;
  const cursor = new Date(today);
  // Allow today OR yesterday as start (so missing today before a session doesn't reset).
  if (!set.has(today.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const BADGES: Array<{ id: string; label: string; need: (p: Profile, s: Stats) => boolean; desc: string }> = [
  { id: "first_step",  label: "First Step",   desc: "Complete your first attempt",     need: (_, s) => s.attempts >= 1 },
  { id: "streak_3",    label: "On a Roll",    desc: "3-day streak",                    need: (_, s) => s.streak >= 3 },
  { id: "streak_7",    label: "Week Warrior", desc: "7-day streak",                    need: (_, s) => s.streak >= 7 },
  { id: "xp_500",      label: "Rising Star",  desc: "500 XP",                          need: (p) => p.xp_total >= 500 },
  { id: "xp_2500",     label: "Elite",        desc: "2,500 XP",                        need: (p) => p.xp_total >= 2500 },
  { id: "accuracy_80", label: "Sharpshooter", desc: "80%+ accuracy over 5+ attempts",  need: (_, s) => s.attempts >= 5 && s.accuracy >= 80 },
  { id: "bookmarker",  label: "Bookmarker",   desc: "Save 10 bookmarks",               need: (_, s) => s.bookmarks >= 10 },
];

type Stats = {
  attempts: number;
  correct: number;
  wrong: number;
  unattempted: number;
  accuracy: number;
  bookmarks: number;
  streak: number;
  rank: number | null;
  recent: Array<{ id: string; title: string; score: number; correct: number; wrong: number; submitted_at: string }>;
  activeDates: string[];
};

function ProfilePage() {
  const { user, loading: authLoading, profile: authProfile } = useAuth();
  const nav = useNavigate();
  const loadLeaderboard = useServerFn(getLeaderboardData);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(20);
  const [year, setYear] = useState<number | "">("");

  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/login" });
  }, [user, authLoading, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (p) {
        setProfile(p as Profile);
        setName(p.full_name ?? "");
        setGoal(p.daily_goal ?? 20);
        setYear(p.target_year ?? "");
      }

      const [{ data: atts }, { data: bms }, rank] = await Promise.all([
        supabase
          .from("attempts")
          .select("id,test_id,score,correct_count,wrong_count,unattempted_count,submitted_at,status,tests:test_id(title)")
          .eq("user_id", user.id)
          .eq("status", "completed")
          .order("submitted_at", { ascending: false })
          .limit(200),
        supabase.from("bookmarks").select("id", { count: "exact", head: false }).eq("user_id", user.id),
        loadLeaderboard(),
      ]);

      const attempts = atts ?? [];
      const correct = attempts.reduce((s, a) => s + (a.correct_count ?? 0), 0);
      const wrong = attempts.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
      const unattempted = attempts.reduce((s, a) => s + (a.unattempted_count ?? 0), 0);
      const total = correct + wrong;
      const dates = attempts
        .filter((a) => a.submitted_at)
        .map((a) => new Date(a.submitted_at as string).toISOString().slice(0, 10));
      setStats({
        attempts: attempts.length,
        correct, wrong, unattempted,
        accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
        bookmarks: bms?.length ?? 0,
        streak: streakFromDates(dates),
        rank: rank?.myRank ?? null,
        recent: attempts.slice(0, 5).map((a) => ({
          id: a.id,
          title: (a.tests as { title?: string } | null)?.title ?? "Test",
          score: a.score ?? 0,
          correct: a.correct_count ?? 0,
          wrong: a.wrong_count ?? 0,
          submitted_at: a.submitted_at as string,
        })),
        activeDates: Array.from(new Set(dates)),
      });
      setLoading(false);
    })();
  }, [user, authProfile]);

  const lvl = useMemo(() => levelFromXp(profile?.xp_total ?? 0), [profile?.xp_total]);
  const earnedBadges = useMemo(
    () => (profile && stats ? BADGES.filter((b) => b.need(profile, stats)) : []),
    [profile, stats],
  );

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: name.trim() || null,
        daily_goal: Math.max(1, Math.min(200, Number(goal) || 20)),
        target_year: year === "" ? null : Number(year),
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    setProfile((p) => p ? { ...p, full_name: name.trim() || null, daily_goal: Number(goal), target_year: year === "" ? null : Number(year) } : p);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  };

  if (loading || !profile) {
    return (
      <PageShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  const initials = (profile.full_name ?? profile.email ?? "U")
    .split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <PageShell>
      {/* Hero / competitive card */}
      <Card className="overflow-hidden border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="relative p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-primary text-2xl font-bold text-primary-foreground shadow-elegant">
                <img
                  src={avatarUrl(profile.full_name ?? profile.email ?? user?.id ?? "you", profile.avatar_url)}
                  alt={profile.full_name ?? "Avatar"}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-extrabold text-primary-foreground shadow-elegant">
                {lvl.level}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold sm:text-2xl">{profile.full_name ?? "Add your name"}</h1>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1"><Trophy className="h-3 w-3" /> {profile.xp_total.toLocaleString()} XP</Badge>
                <Badge variant="secondary" className="gap-1"><Flame className="h-3 w-3 text-primary" /> {stats?.streak ?? 0}-day streak</Badge>
                {stats?.rank && <Badge variant="secondary" className="gap-1"><TrendingUp className="h-3 w-3" /> #{stats.rank}</Badge>}
                {profile.target_year && <Badge variant="outline">NEET {profile.target_year}</Badge>}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Level {lvl.level}</span>
              <span>{lvl.inLevel}/250 to L{lvl.level + 1}</span>
            </div>
            <Progress value={lvl.pct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Target className="h-4 w-4" />} label="Attempts" value={stats?.attempts ?? 0} />
        <StatTile icon={<Sparkles className="h-4 w-4" />} label="Accuracy" value={`${stats?.accuracy ?? 0}%`} />
        <StatTile icon={<BookmarkCheck className="h-4 w-4" />} label="Bookmarks" value={stats?.bookmarks ?? 0} />
        <StatTile icon={<Calendar className="h-4 w-4" />} label="Active days" value={stats?.activeDates.length ?? 0} />
      </div>

      {/* Guided app tour */}
      <Card className="mt-4 overflow-hidden">
        <CardContent className="flex items-center gap-3 p-4">
          <img
            src={DR_VANSHU_IMG}
            alt="Dr. Vanshu, your Neet Buddy guide"
            className="h-16 w-16 shrink-0 select-none object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight text-foreground">Take a tour with Dr. Vanshu</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              A quick guided walkthrough of every feature and page.
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => startAppTour()}>
            Start tour <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>



      {/* Daily goal */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4" /> Today's goal</CardTitle>
          <CardDescription>{stats?.correct ?? 0} correct today vs goal of {profile.daily_goal} questions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress
            value={Math.min(100, ((todayCount(stats?.recent ?? [], stats?.activeDates ?? []) / profile.daily_goal) * 100))}
            className="h-2"
          />
        </CardContent>
      </Card>

      {/* Badges */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4" /> Badges</CardTitle>
          <CardDescription>{earnedBadges.length} of {BADGES.length} unlocked</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BADGES.map((b) => {
              const earned = earnedBadges.some((e) => e.id === b.id);
              return (
                <div
                  key={b.id}
                  className={
                    "rounded-lg border p-3 text-center transition " +
                    (earned ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40 opacity-60")
                  }
                >
                  <Award className={"mx-auto mb-1 h-5 w-5 " + (earned ? "text-primary" : "text-muted-foreground")} />
                  <div className="text-xs font-semibold">{b.label}</div>
                  <div className="text-[10px] text-muted-foreground">{b.desc}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent attempts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats?.recent.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet. Take your first quiz!</p>}
          {stats?.recent.map((a) => (
            <Link
              key={a.id}
              to="/analysis/$attemptId"
              params={{ attemptId: a.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3 hover:bg-accent/50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{a.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.submitted_at).toLocaleDateString()} · {a.correct} ✓ / {a.wrong} ✗
                </div>
              </div>
              <div className="text-sm font-bold">{a.score}</div>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Icon picker */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Smile className="h-4 w-4" /> Choose your icon</CardTitle>
          <CardDescription>Pick a designed avatar — custom uploads aren't allowed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {NEETIQ_AVATARS.map((url) => {
              const selected = profile.avatar_url === url;
              return (
                <button
                  key={url}
                  type="button"
                  onClick={async () => {
                    const prev = profile.avatar_url;
                    setProfile({ ...profile, avatar_url: url });
                    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user!.id);
                    if (error) {
                      setProfile({ ...profile, avatar_url: prev });
                      toast.error(error.message);
                    } else {
                      toast.success("Icon updated");
                    }
                  }}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-full border-2 transition",
                    selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40",
                  )}
                  aria-label="Pick avatar"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {selected && (
                    <span className="absolute inset-0 flex items-center justify-center bg-primary/30">
                      <Check className="h-4 w-4 text-white drop-shadow" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit details */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Edit profile</CardTitle>
          <CardDescription>Personalize your competitive card.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal">Daily goal (Qs)</Label>
              <Input id="goal" type="number" min={1} max={200} value={goal} onChange={(e) => setGoal(Number(e.target.value))} />
            </div>
            <div>
              <Label htmlFor="year">NEET target year</Label>
              <Input id="year" type="number" min={2024} max={2035} value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 2026" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" onClick={signOut} className="gap-2"><LogOut className="h-4 w-4" /> Sign out</Button>
            <Button onClick={save} disabled={saving} className="gap-2 bg-gradient-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">{icon} {label}</div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function todayCount(recent: Stats["recent"], _activeDates: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return recent.filter((r) => (r.submitted_at ?? "").slice(0, 10) === today).reduce((s, r) => s + r.correct, 0);
}
