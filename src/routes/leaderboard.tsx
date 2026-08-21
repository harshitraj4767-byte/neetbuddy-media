import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, Info, Trophy, Flame } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboardData, getStreakLeaderboard } from "@/lib/leaderboard.functions";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Neet Buddy" }, { name: "description", content: "Top XP earners and longest streaks across Neet Buddy." }] }),
  component: LeaderboardPage,
});

type XpRow = { id: string; full_name: string | null; email: string | null; xp_total: number };
type StreakRow = { id: string; full_name: string | null; streak: number };

function daysUntilReset() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 86400000));
}

function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<XpRow[] | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [streakRows, setStreakRows] = useState<StreakRow[] | null>(null);
  const [myStreak, setMyStreak] = useState<number>(0);
  const [myStreakRank, setMyStreakRank] = useState<number | null>(null);

  const loadXp = useServerFn(getLeaderboardData);
  const loadStreak = useServerFn(getStreakLeaderboard);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const data = await loadXp();
      setRows(data.rows as XpRow[]);
      setMyRank(data.myRank);
    })();
  }, [user, profile, loadXp]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const data = await loadStreak();
      setStreakRows(data.rows as StreakRow[]);
      setMyStreak(data.myStreak);
      setMyStreakRank(data.myRank);
    })();
  }, [user, loadStreak]);

  const myXp = (profile as unknown as { xp_total?: number } | null)?.xp_total ?? 0;
  const level = Math.max(1, Math.floor(myXp / 250) + 1);

  return (
    <PageShell>
      <div className="-mt-2 mb-4 flex items-center justify-between">
        <button onClick={() => history.back()} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-primary">
          <ChevronLeft className="h-5 w-5" /> Leaderboard
        </button>
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>

      <Card className="mb-4 border-border bg-primary/5">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-elegant">
            <div className="text-center leading-none">
              <Trophy className="mx-auto mb-0.5 h-4 w-4" />
              <div className="text-sm font-extrabold">{level}</div>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="rounded-md bg-card px-3 py-1.5 text-center text-xs font-semibold">
              Leaderboard updates in <span className="font-extrabold">{daysUntilReset()} days</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> XP
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span><span className="text-[10px] text-muted-foreground">Rank </span><span className="font-bold">{myRank ?? "—"}</span></span>
                <span><span className="text-[10px] text-muted-foreground">Total </span><span className="font-bold">{myXp}</span></span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md bg-card px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-orange-500" /> Streak
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span><span className="text-[10px] text-muted-foreground">Rank </span><span className="font-bold">{myStreakRank ?? "—"}</span></span>
                <span><span className="text-[10px] text-muted-foreground">Days </span><span className="font-bold">{myStreak}</span></span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="xp" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="xp" className="gap-1.5"><Trophy className="h-3.5 w-3.5" /> XP</TabsTrigger>
          <TabsTrigger value="streak" className="gap-1.5"><Flame className="h-3.5 w-3.5" /> Streak</TabsTrigger>
        </TabsList>

        <TabsContent value="xp" className="mt-3">
          {rows === null ? (
            <LoadingScreen variant="leaderboard" fullScreen={false} />
          ) : rows.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No XP yet. Be the first — <Link to="/dashboard" className="text-primary underline">start a quiz</Link>.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => {
                const isMe = user?.id === r.id;
                const rank = i + 1;
                const badgeColor =
                  rank === 1 ? "bg-amber-500 text-white" :
                  rank === 2 ? "bg-blue-500 text-white" :
                  rank === 3 ? "bg-emerald-500 text-white" : "bg-secondary text-foreground";
                return (
                  <Card key={r.id} className={cn("border-border", isMe && "border-primary ring-1 ring-primary/40 bg-primary/5")}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold", badgeColor)}>{rank}</div>
                      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{r.full_name ?? r.email ?? "User"}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{r.xp_total}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">XP</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="streak" className="mt-3">
          {streakRows === null ? (
            <LoadingScreen variant="leaderboard" fullScreen={false} />
          ) : streakRows.length === 0 ? (
            <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No streaks yet. Complete a quiz daily to build yours.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {streakRows.map((r, i) => {
                const isMe = user?.id === r.id;
                const rank = i + 1;
                const badgeColor =
                  rank === 1 ? "bg-orange-500 text-white" :
                  rank === 2 ? "bg-amber-500 text-white" :
                  rank === 3 ? "bg-rose-500 text-white" : "bg-secondary text-foreground";
                return (
                  <Card key={r.id} className={cn("border-border", isMe && "border-primary ring-1 ring-primary/40 bg-primary/5")}>
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold", badgeColor)}>{rank}</div>
                      <div className="min-w-0 flex-1 truncate text-sm font-semibold">{r.full_name ?? "User"}</div>
                      <div className="flex items-center gap-1.5">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="font-bold">{r.streak}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">days</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
