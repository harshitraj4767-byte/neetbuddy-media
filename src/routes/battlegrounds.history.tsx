import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Crown, Loader2, Swords, Trophy } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { avatarUrl } from "@/lib/avatar";
import { avatarForName } from "@/lib/neetiq-avatars";
import { cn } from "@/lib/utils";

const supabase = supabaseTyped as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const Route = createFileRoute("/battlegrounds/history")({
  head: () => ({ meta: [{ title: "Battleground History — 1v1 Quiz Battles" }] }),
  component: BattlegroundHistoryPage,
});

type HistoryItem = {
  id: string;
  status: string;
  stake: number;
  prize: number;
  winnerUserId: string | null;
  myScore: number | null;
  botScore: number | null;
  endsAt: string | null;
  opponentName: string;
  opponentAvatar: string | null;
  opponentIsBot: boolean;
};

const BOT_NAMES = ["Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova", "Tara Flux"];
function botIdentity(matchId: string, name?: string | null, avatar?: string | null) {
  const cleanName = name?.trim();
  const n = Array.from(matchId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const displayName = cleanName || BOT_NAMES[n % BOT_NAMES.length];
  return { name: displayName, avatar: avatar?.trim() || avatarForName(displayName) };
}

function BattlegroundHistoryPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [loading, nav, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setPageLoading(true);
      setErr(null);
      const { data: mine, error: mineErr } = await supabase
        .from("battle_match_players")
        .select("match_id,score,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled) return;
      if (mineErr) {
        console.error("[bg-history] failed to load player matches", mineErr, { userId: user.id });
        setErr(mineErr.message ?? "Could not load your battleground history.");
        setPageLoading(false);
        return;
      }

      const ids = ((mine ?? []) as any[]).map((row) => row.match_id).filter(Boolean);
      if (!ids.length) {
        setItems([]);
        setPageLoading(false);
        return;
      }

      const { data: matches, error: matchesErr } = await supabase
        .from("battle_matches")
        .select("id,status,stake,prize_amount,winner_user_id,ends_at,is_bot_match,bot_name,bot_avatar_url,bot_score")
        .in("id", ids)
        .order("ends_at", { ascending: false });

      if (cancelled) return;
      if (matchesErr) {
        console.error("[bg-history] failed to load matches", matchesErr, { ids });
        setErr(matchesErr.message ?? "Could not load your battleground history.");
        setPageLoading(false);
        return;
      }

      // Pending matches (ends_at = null) bubble to the top so users see
      // ongoing battles first; finished matches sort newest-first.
      const rows = ((matches ?? []) as any[])
        .sort((a, b) => {
          const at = a.ends_at ? new Date(a.ends_at).getTime() : Number.POSITIVE_INFINITY;
          const bt = b.ends_at ? new Date(b.ends_at).getTime() : Number.POSITIVE_INFINITY;
          return bt - at;
        });

      const enriched = await Promise.all(rows.map(async (match) => {
        if (match.is_bot_match) {
          const bot = botIdentity(String(match.id), match.bot_name, match.bot_avatar_url);
          const myRow = ((mine ?? []) as any[]).find((row) => row.match_id === match.id);
          return {
            id: String(match.id),
            status: String(match.status ?? "unknown"),
            stake: Number(match.stake ?? 0),
            prize: Number(match.prize_amount ?? 0),
            winnerUserId: (match.winner_user_id as string | null) ?? null,
            myScore: myRow?.score == null ? null : Number(myRow.score),
            botScore: match.bot_score == null ? null : Number(match.bot_score),
            endsAt: (match.ends_at as string | null) ?? null,
            opponentName: bot.name,
            opponentAvatar: bot.avatar,
            opponentIsBot: true,
          } satisfies HistoryItem;
        }

        const { data: oppRows, error: oppErr } = await supabase.rpc("bg_get_opponent_profile", {
          _match_id: match.id,
        });
        if (oppErr) {
          console.error("[bg-history] failed to load opponent profile", oppErr, { matchId: match.id });
        }
        const opp = Array.isArray(oppRows) ? oppRows[0] : oppRows;
        const rawName = typeof opp?.full_name === "string" ? opp.full_name.trim() : "";
        const fallbackEmail = typeof opp?.email === "string" ? opp.email.split("@")[0] : null;

        return {
          id: String(match.id),
          status: String(match.status ?? "unknown"),
          stake: Number(match.stake ?? 0),
          prize: Number(match.prize_amount ?? 0),
          winnerUserId: (match.winner_user_id as string | null) ?? null,
            myScore: null,
            botScore: null,
          endsAt: (match.ends_at as string | null) ?? null,
          opponentName: rawName || fallbackEmail || `Player ${String(opp?.user_id ?? match.id).slice(0, 4)}`,
          opponentAvatar: (opp?.avatar_url as string | null) ?? null,
          opponentIsBot: false,
        } satisfies HistoryItem;
      }));

      if (cancelled) return;
      setItems(enriched);
      setPageLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading || pageLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Battleground archive
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">View all battlegrounds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every 1v1 result, win, loss, tie, and prize in one place.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/battlegrounds">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>
      </div>

      {err ? (
        <Card className="mt-4">
          <CardContent className="p-6 text-center text-sm text-destructive">{err}</CardContent>
        </Card>
      ) : null}

      {!err && !items.length ? (
        <Card className="mt-4 border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Swords className="h-7 w-7" />
            </div>
            <div>
              <div className="text-base font-extrabold">No battlegrounds played yet</div>
              <div className="text-sm text-muted-foreground">Your finished battles will appear here after the first match.</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!!items.length && (
        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const isBotLoss = item.opponentIsBot && item.status === "finished" && !item.winnerUserId && item.myScore !== item.botScore;
            const isTie = item.status === "finished" && !item.winnerUserId && !isBotLoss;
            const won = item.winnerUserId === user.id;
            const lost = item.status === "finished" && (isBotLoss || (!isTie && !won));
            return (
              <Link
                key={item.id}
                to="/battle/$matchId/result"
                params={{ matchId: item.id }}
                className="block rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-elegant"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    isTie && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    won && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    lost && "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                    !isTie && !won && !lost && "bg-primary/10 text-primary",
                  )}>
                    {won ? <Crown className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <img
                        src={avatarUrl(item.opponentName, item.opponentAvatar)}
                        alt={item.opponentName}
                        className="h-8 w-8 rounded-full border border-border object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold">vs {item.opponentName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.stake > 0 ? `Stake ₹${item.stake}` : "Free battle"}
                          {item.opponentIsBot ? " · Bot match" : " · Real player"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={cn(
                      "text-sm font-extrabold",
                      isTie && "text-amber-600 dark:text-amber-400",
                      won && "text-emerald-600 dark:text-emerald-400",
                      lost && "text-rose-600 dark:text-rose-400",
                    )}>
                      {isTie ? "Tie" : won ? (item.prize > 0 ? `Won ₹${item.prize.toFixed(2)}` : "Won") : "Lost"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.endsAt ? new Date(item.endsAt).toLocaleString() : "Pending"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}