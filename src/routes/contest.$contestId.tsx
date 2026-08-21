import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2,
  Trophy,
  Timer,
  Users,
  ArrowRight,
  Medal,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getContestDetail, joinContest } from "@/lib/contests.functions";
import { RichText } from "@/components/rich-text";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/contest/$contestId")({
  head: () => ({ meta: [{ title: "Daily Live Quiz — Neet Buddy" }] }),
  component: ContestPage,
});

type Detail = Awaited<ReturnType<typeof getContestDetail>>;

function useCountdown(toIso: string | null | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!toIso) return { hh: "00", mm: "00", ss: "00", over: true, totalSec: 0 };
  const diff = new Date(toIso).getTime() - Date.now();
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  return {
    hh: String(Math.floor(totalSec / 3600)).padStart(2, "0"),
    mm: String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0"),
    ss: String(totalSec % 60).padStart(2, "0"),
    over: diff <= 0,
    totalSec,
  };
}

function ContestPage() {
  const { contestId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const router = useRouter();
  const fetchDetail = useServerFn(getContestDetail);
  const joinFn = useServerFn(joinContest);

  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);

  const load = useCallback(() => {
    return fetchDetail({ data: { contest_id: contestId } })
      .then(setD)
      .catch((e) => setErr(e?.message ?? "Failed to load"));
  }, [fetchDetail, contestId]);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    load();
  }, [load]);


  // Realtime: leaderboard updates while contest is live
  useEffect(() => {
    if (!d?.contest.test_id) return;
    const ch = supabase
      .channel(`contest-${contestId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attempts", filter: `test_id=eq.${d.contest.test_id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contest_entries", filter: `contest_id=eq.${contestId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contest_results", filter: `contest_id=eq.${contestId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [d?.contest.test_id, contestId, load]);

  if (loading || (!d && !err))
    return (
      <LoadingScreen variant="contest" />
    );

  if (err || !d)
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

  const c = d.contest;
  const now = Date.now();
  const startsAt = new Date(c.starts_at).getTime();
  const endsAt = new Date(c.ends_at).getTime();
  const isPre = now < startsAt;
  const isLive = now >= startsAt && now < endsAt;
  const isPost = now >= endsAt;
  const joined = !!d.my_entry;
  const submitted = !!d.my_entry?.attempt_id;

  // Daily Live Quiz is free — always join with 0 fee. On live entry, prompt
  // for Quiz vs CBT mode before launching, matching Daily DPP / Mocks.
  const doJoin = async (thenStart: boolean) => {
    if (joined) {
      if (thenStart && c.test_id) setModePickerOpen(true);
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      // Ensure session is hydrated before invoking the RPC — the bearer
      // attacher reads getSession() synchronously and a stale session shows
      // up as an unending spinner rather than a real 401.
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.access_token) {
        setJoinError("Your session expired. Please sign in again.");
        return;
      }
      const res = await joinFn({ data: { contest_id: contestId, entry_fee: 0 } });
      toast.success("Joined! Good luck.");
      const testId = res?.test_id ?? c.test_id;
      if (thenStart && testId) {
        setModePickerOpen(true);
        return;
      }
      await load();
      router.invalidate();
    } catch (e) {
      const msg = (e as Error)?.message ?? "Could not join";
      setJoinError(msg);
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  };


  const launchWithMode = (mode: QuizMode) => {
    setModePickerOpen(false);
    if (c.test_id) nav({ to: "/quiz/$testId", params: { testId: c.test_id }, search: { mode } });
  };


  const meId = user!.id;
  const myRow = d.leaderboard.find((r) => r.user_id === meId);

  // Which tabs to show per state.
  const tabs: Array<"leaderboard" | "prizes" | "solutions"> = isPost
    ? ["leaderboard", "prizes", "solutions"]
    : isLive
      ? ["leaderboard", "prizes"]
      : ["prizes"];

  return (
    <PageShell>
      {/* Hero card */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-blue-600 p-6 text-primary-foreground shadow-elegant sm:p-8">
        <div className="flex items-start gap-4">
          <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur sm:flex">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge className="bg-white/20 text-primary-foreground hover:bg-white/30">
              Daily Live Quiz · {isPre ? "Upcoming" : isLive ? "Live now" : "Ended"}
            </Badge>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{c.title}</h1>
            {c.description && (
              <p className="mt-1 line-clamp-2 text-sm text-white/90">{c.description}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Pill icon={<Trophy className="h-3 w-3" />} label="Free to join · XP rewards" />
              <Pill icon={<Users className="h-3 w-3" />} label={`${c.total_questions} Qs`} />
              <Pill icon={<Timer className="h-3 w-3" />} label={`${c.duration_min} min`} />
              <Pill icon={<Users className="h-3 w-3" />} label={`${d.entries_count} joined`} />
            </div>
          </div>
        </div>
      </div>

      {joinError && (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-semibold">Couldn't join this quiz</div>
          <div className="mt-1 opacity-80">{joinError}</div>
        </div>
      )}

      {/* CTA / status card */}

      {isPre && (
        <PreContest
          startsAt={c.starts_at}
          joined={joined}
          joining={joining}
          onJoin={() => doJoin(false)}
        />
      )}

      {isLive && (
        <LiveSection
          endsAt={c.ends_at}
          joined={joined}
          submitted={submitted}
          joining={joining}
          onJoinAndStart={() => doJoin(true)}
          onStart={() => setModePickerOpen(true)}
        />
      )}

      {isPost && myRow && (
        <Card className="mt-4 border-0 shadow-soft">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
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
              ) : (
                <Badge variant="secondary">Better luck next time</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <QuizModePicker
        open={modePickerOpen}
        subtitle="Pick how you want to play this Daily Live Quiz."
        onClose={() => setModePickerOpen(false)}
        onPick={launchWithMode}
      />

      {/* Single tab strip — prize distribution lives ONLY inside the Prizes tab. */}
      <Tabs defaultValue={tabs[0]} className="mt-6 w-full">
        <TabsList
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.includes("leaderboard") && (
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          )}
          {tabs.includes("prizes") && <TabsTrigger value="prizes">Prizes</TabsTrigger>}
          {tabs.includes("solutions") && <TabsTrigger value="solutions">Solutions</TabsTrigger>}
        </TabsList>

        {tabs.includes("leaderboard") && (
          <TabsContent value="leaderboard" className="mt-4">
            {d.leaderboard.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {isLive ? "Leaderboard updates as players submit." : "No participants ranked."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {d.leaderboard.map((r) => (
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
        )}

        {tabs.includes("prizes") && (
          <TabsContent value="prizes" className="mt-4">
            <PrizeDistribution
              prizePool={Number(c.prize_pool)}
              split={d.prize_split}
              leaderboard={d.leaderboard}
              entryFee={0}
              joiners={d.entries_count}
              embedded
            />
          </TabsContent>
        )}

        {tabs.includes("solutions") && (
          <TabsContent value="solutions" className="mt-4 space-y-2">
            {d.questions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Solutions not available.</p>
            ) : (
              d.questions.map((q, i) => <SolutionRow key={q.id} q={q} idx={i} />)
            )}
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 font-semibold backdrop-blur">
      {icon} {label}
    </span>
  );
}

function PreContest({
  startsAt,
  joined,
  joining,
  onJoin,
}: {
  startsAt: string;
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  const t = useCountdown(startsAt);
  return (
    <Card className="mt-4 border-0 shadow-soft">
      <CardContent className="p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Starts in
        </div>
        <div className="mt-1 flex items-baseline gap-1 font-mono text-3xl font-extrabold tabular-nums">
          {t.hh}<span className="text-muted-foreground">:</span>{t.mm}<span className="text-muted-foreground">:</span>{t.ss}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {new Date(startsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Entry" value="Free" accent="text-emerald-600" />
          <Stat label="Rewards" value="XP" />
        </div>

        <div className="mt-4">
          {joined ? (
            <Button disabled className="h-12 w-full" variant="secondary">
              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> You're in — see you at start
            </Button>
          ) : (
            <Button onClick={onJoin} disabled={joining} className="h-12 w-full bg-gradient-primary">
              {joining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Join free <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveSection({
  endsAt,
  joined,
  submitted,
  joining,
  onJoinAndStart,
  onStart,
}: {
  endsAt: string;
  joined: boolean;
  submitted: boolean;
  joining: boolean;
  onJoinAndStart: () => void;
  onStart: () => void;
}) {
  const t = useCountdown(endsAt);
  return (
    <Card className="mt-4 border-0 shadow-soft">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ends in</div>
            <div className="mt-1 font-mono text-2xl font-extrabold tabular-nums">
              {t.hh}:{t.mm}:{t.ss}
            </div>
          </div>
          <Badge className="bg-destructive text-destructive-foreground">
            <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> LIVE
          </Badge>
        </div>
        <div className="mt-4">
          {submitted ? (
            <Button disabled className="h-12 w-full" variant="secondary">
              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Submitted — awaiting results
            </Button>
          ) : joined ? (
            <Button onClick={onStart} className="h-12 w-full bg-gradient-primary">
              Start test <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onJoinAndStart} disabled={joining} className="h-12 w-full bg-gradient-primary">
              {joining ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Join &amp; start <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const PRIZE_WEIGHTS = [30, 20, 12, 10, 8, 6, 5, 4, 3, 2];

function PrizeDistribution({
  prizePool,
  split,
  leaderboard,
  entryFee,
  joiners,
  embedded,
}: {
  prizePool: number;
  split: number[];
  leaderboard: Detail["leaderboard"];
  entryFee: number;
  joiners: number;
  embedded?: boolean;
}) {
  return (
    <Card className={cn("border-0 shadow-soft", !embedded && "mt-6")}>
      <CardContent className="p-5">
        <div className="mb-3 rounded-xl border border-border bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Prize Pool
          </div>
          <div className="text-2xl font-extrabold text-emerald-600">₹{prizePool.toFixed(0)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {entryFee > 0
              ? `₹${entryFee.toFixed(0)} entry × ${joiners} joiner${joiners === 1 ? "" : "s"}`
              : "Free contest"}
          </div>
        </div>

        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          The whole pool is shared among actual joiners (up to top 10) using weights
          30/20/12/10/8/6/5/4/3/2 — automatically normalised when fewer players join.
        </p>

        {split.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Prizes unlock once players join the contest.
          </p>
        ) : (
          <div className="space-y-2">
            {split.map((amount, i) => {
              const rank = i + 1;
              const winner = leaderboard.find((r) => r.rank === rank);
              const wsum = PRIZE_WEIGHTS.slice(0, split.length).reduce((a, b) => a + b, 0);
              const pct = Math.round((PRIZE_WEIGHTS[i] / wsum) * 100);
              return (
                <div
                  key={rank}
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                >
                  <span className="flex items-center gap-2">
                    {rank <= 3 ? (
                      <Medal
                        className={cn(
                          "h-5 w-5",
                          rank === 1 && "text-amber-500",
                          rank === 2 && "text-zinc-400",
                          rank === 3 && "text-orange-700",
                        )}
                      />
                    ) : (
                      <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                        {rank}
                      </span>
                    )}
                    <span className="text-sm font-semibold">Rank #{rank}</span>
                    <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                  </span>
                  <div className="text-right">
                    <div className="text-sm font-extrabold text-emerald-600">
                      ₹{amount.toFixed(0)}
                    </div>
                    {winner && (
                      <div className="text-[10px] text-muted-foreground">
                        {winner.full_name ?? "Anonymous"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function SolutionRow({
  q,
  idx,
}: {
  q: Detail["questions"][number];
  idx: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold">
          {idx + 1}
        </span>
        <span className="line-clamp-2 flex-1 text-xs">
          <RichText>{q.text}</RichText>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs">
          <div className="space-y-1.5">
            {q.options.map((opt, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md border px-2.5 py-1.5",
                  i === q.correct_index
                    ? "border-emerald-400/60 bg-emerald-500/5"
                    : "border-border",
                )}
              >
                <span className="mr-2 font-bold">{String.fromCharCode(65 + i)}.</span>
                <RichText>{opt}</RichText>
                {i === q.correct_index && (
                  <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />
                )}
              </div>
            ))}
          </div>
          {q.explanation && (
            <div className="rounded-md bg-secondary/40 p-2.5">
              <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                Explanation
              </div>
              <RichText>{q.explanation}</RichText>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-lg font-extrabold", accent)}>{value}</div>
    </div>
  );
}
