import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Medal, CheckCircle2, XCircle, ChevronDown, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { getContestDetail } from "@/lib/contests.functions";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/contest/$contestId/results")({
  head: () => ({ meta: [{ title: "Contest results — Neet Buddy" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const { contestId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fetchDetail = useServerFn(getContestDetail);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getContestDetail>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const d = await fetchDetail({ data: { contest_id: contestId } });
        if (cancelled) return;
        setDetail(d);
        setErr(null);
        if (d.contest.status === "finalized" && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch (e: any) {
        if (cancelled) return;
        const m = e?.message ?? "Failed to load";
        setErr(m);
        toast.error(m);
      }
    };

    load();
    // Poll faster so the leaderboard feels live (was 15s).
    timer = setInterval(load, 5000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    // Realtime: refresh immediately when contest_results / contest_entries / attempts change.
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (cancelled) return;
      const channel = supabase
        .channel(`contest-${contestId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "contest_results", filter: `contest_id=eq.${contestId}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "contest_entries", filter: `contest_id=eq.${contestId}` }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "attempts" }, load)
        .subscribe();
      (window as any).__contestChannel = channel;
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      const ch = (window as any).__contestChannel;
      if (ch) import("@/integrations/supabase/client").then(({ supabase }) => supabase.removeChannel(ch));
    };
  }, [fetchDetail, contestId]);

  if (loading || (!detail && !err))
    return (
      <LoadingScreen variant="result" />
    );

  if (err || !detail)
    return (
      <PageShell>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive">{err ?? "Contest not found."}</p>
            <Button asChild variant="link">
              <Link to="/contests">Back to contests</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );

  const c = detail.contest;
  const prizePool = Number(c.prize_pool);
  const prizes = [
    { rank: 1, pct: 50, amount: prizePool * 0.5 },
    { rank: 2, pct: 30, amount: prizePool * 0.3 },
    { rank: 3, pct: 20, amount: prizePool * 0.2 },
  ];
  const meId = user!.id;
  const myRow = detail.leaderboard.find((r) => r.user_id === meId);

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/contests">
          <ArrowLeft className="mr-1 h-4 w-4" /> All contests
        </Link>
      </Button>

      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-blue-600 p-6 text-primary-foreground shadow-elegant">
        <div className="flex items-start gap-4">
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur sm:flex">
            <Trophy className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">Results</div>
            <h1 className="mt-1 truncate text-2xl font-extrabold">{c.title}</h1>
            <p className="mt-1 text-xs text-white/85">
              Ended {new Date(c.ends_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      </div>

      {myRow && (
        <Card className="mt-4 border-0 shadow-soft">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Your finish
              </div>
              <div className="mt-1 text-3xl font-extrabold">#{myRow.rank}</div>
              <div className="text-xs text-muted-foreground">{myRow.score.toFixed(0)} points</div>
            </div>
            {myRow.prize_amount > 0 ? (
              <div className="text-right">
                <div className="text-xs font-bold uppercase text-emerald-600">You won</div>
                <div className="text-3xl font-extrabold text-emerald-600">
                  ₹{myRow.prize_amount.toFixed(0)}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="leaderboard" className="mt-4 w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="prizes">Prizes</TabsTrigger>
          <TabsTrigger value="solutions">Solutions</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard" className="mt-4">
          {detail.leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No participants ranked.</p>
          ) : (
            <ul className="space-y-1.5">
              {detail.leaderboard.map((r) => (
                <li
                  key={r.user_id}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs",
                    r.user_id === meId && "border-primary/40 bg-primary/5 font-bold text-primary",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {r.rank <= 3 ? (
                      <Medal
                        className={cn(
                          "h-4 w-4",
                          r.rank === 1 && "text-amber-500",
                          r.rank === 2 && "text-zinc-400",
                          r.rank === 3 && "text-orange-700",
                        )}
                      />
                    ) : (
                      <span className="w-4 text-center text-[10px] text-muted-foreground">{r.rank}</span>
                    )}
                    {r.full_name ?? "Anonymous"}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground">{r.score.toFixed(0)} pts</span>
                    {r.prize_amount > 0 && (
                      <span className="font-bold text-emerald-600">₹{r.prize_amount.toFixed(0)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="prizes" className="mt-4 space-y-2">
          <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Prize Pool
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">₹{prizePool.toFixed(0)}</div>
          </div>
          {prizes.map((p) => {
            const winner = detail.leaderboard.find((r) => r.rank === p.rank);
            return (
              <div
                key={p.rank}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
              >
                <span className="flex items-center gap-2">
                  <Medal
                    className={cn(
                      "h-5 w-5",
                      p.rank === 1 && "text-amber-500",
                      p.rank === 2 && "text-zinc-400",
                      p.rank === 3 && "text-orange-700",
                    )}
                  />
                  <span className="text-sm font-semibold">Rank #{p.rank}</span>
                  <span className="text-[10px] text-muted-foreground">({p.pct}%)</span>
                </span>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-600">₹{p.amount.toFixed(0)}</div>
                  {winner && (
                    <div className="text-[10px] text-muted-foreground">
                      {winner.full_name ?? "Anonymous"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="solutions" className="mt-4 space-y-2">
          {detail.questions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Solutions not available.</p>
          ) : (
            detail.questions.map((q, i) => <SolutionItem key={q.id} q={q} index={i} />)
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function SolutionItem({
  q,
  index,
}: {
  q: { id: string; text: string; options: string[]; correct_index: number; explanation: string | null };
  index: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="flex min-w-0 items-start gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
            {index + 1}
          </span>
          <span className="line-clamp-2 text-xs">{q.text}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => (
              <div
                key={oi}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                  oi === q.correct_index
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border",
                )}
              >
                {oi === q.correct_index ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
                <span>{opt}</span>
              </div>
            ))}
          </div>
          {q.explanation && (
            <div className="mt-3 rounded-lg bg-secondary/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-bold text-foreground">Explanation: </span>
              {q.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
