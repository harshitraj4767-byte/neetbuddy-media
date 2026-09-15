import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, Info, Trophy, Flame } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/leaderboard.php", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.rows)) setRows(data.rows);
          if (typeof data.myRank === "number") setMyRank(data.myRank);
          if (Array.isArray(data.streakRows)) setStreakRows(data.streakRows);
          if (typeof data.myStreak === "number") setMyStreak(data.myStreak);
          if (typeof data.myStreakRank === "number") setMyStreakRank(data.myStreakRank);
          return;
        }
      } catch (e) {
        console.warn("Failed to load /api/leaderboard.php:", e);
      }
      setRows([]);
      setStreakRows([]);
    })();
  }, []);

  return (
    <PageShell
      title="Leaderboard"
      description="See how you rank against fellow NEET aspirants in XP and daily consistency."
    >
      <div className="mb-6 flex items-center justify-between">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <span className="text-xs text-muted-foreground">Resets in {daysUntilReset()} days</span>
      </div>

      <Tabs defaultValue="xp" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="xp" className="gap-2"><Trophy className="h-4 w-4" /> Top XP</TabsTrigger>
          <TabsTrigger value="streaks" className="gap-2"><Flame className="h-4 w-4" /> Daily Streaks</TabsTrigger>
        </TabsList>

        <TabsContent value="xp">
          {rows === null ? (
            <LoadingScreen fullScreen={false} variant="quiz" />
          ) : rows.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No leaderboard entries yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {rows.map((r, i) => (
                  <div key={r.id} className={cn("flex items-center justify-between p-4", user?.id === r.id && "bg-primary/5 font-semibold")}>
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-700" : i === 2 ? "bg-amber-600/20 text-amber-900" : "text-muted-foreground")}>
                        {i + 1}
                      </span>
                      <span>{r.full_name || "Aspirant"}</span>
                    </div>
                    <span className="text-sm font-bold text-primary">{r.xp_total ?? 0} XP</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="streaks">
          {streakRows === null ? (
            <LoadingScreen fullScreen={false} variant="quiz" />
          ) : streakRows.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No active streaks yet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {streakRows.map((r, i) => (
                  <div key={r.id} className={cn("flex items-center justify-between p-4", user?.id === r.id && "bg-primary/5 font-semibold")}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-muted-foreground">{i + 1}</span>
                      <span>{r.full_name || "Aspirant"}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-amber-600"><Flame className="h-4 w-4" /> {r.streak} days</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
