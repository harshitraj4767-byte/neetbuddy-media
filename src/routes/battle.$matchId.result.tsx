import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Trophy,
  Frown,
  Handshake,
  Swords,
  ArrowRight,
  Crown,
  Sparkles,
  Hourglass,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { avatarUrl } from "@/lib/avatar";
import { useServerFn } from "@tanstack/react-start";
import { finalizeBotMatch } from "@/lib/battle-bot-finalize.functions";
import { avatarForName } from "@/lib/neetiq-avatars";

const supabase = supabaseTyped as unknown as {
  from: (t: string) => any;
};

export const Route = createFileRoute("/battle/$matchId/result")({
  head: () => ({ meta: [{ title: "Battle Result — Neet Buddy" }] }),
  component: BattleResultPage,
});

type Match = {
  id: string;
  stake: number;
  status: string;
  winner_user_id: string | null;
  prize_amount: number;
  is_bot_match?: boolean;
  bot_name?: string | null;
  bot_avatar_url?: string | null;
  bot_score?: number | null;
  bot_submitted_at?: string | null;
};

type Player = {
  user_id: string;
  score: number;
  submitted_at: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_bot?: boolean;
};

const BOT_NAMES = ["Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova", "Tara Flux"];
function botIdentity(matchId: string, name?: string | null, avatar?: string | null) {
  const cleanName = name?.trim();
  const n = Array.from(matchId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const displayName = cleanName && !["opponent", "bot opponent"].includes(cleanName.toLowerCase()) ? cleanName : BOT_NAMES[n % BOT_NAMES.length];
  return { name: displayName, avatar: avatar?.trim() || avatarForName(displayName) };
}

function BattleResultPage() {
  const { matchId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const finalizeBot = useServerFn(finalizeBotMatch);
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showCelebrate, setShowCelebrate] = useState(false);

  // Reveal gate: once we detect both sides submitted (or status=finished),
  // we lock the result for 10s behind a "Submitting both results…" screen
  // so the outcome lands with a clear beat instead of popping in raw.
  const [bothSubmittedAt, setBothSubmittedAt] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let locked = false;

    const load = async () => {
      if (locked) return;
      const { data: m, error: mErr } = await supabase
        .from("battle_matches")
        .select(
          "id,stake,status,winner_user_id,prize_amount,is_bot_match,bot_name,bot_avatar_url,bot_score,bot_submitted_at",
        )
        .eq("id", matchId)
        .maybeSingle();
      if (cancelled) return;
      if (mErr) {
        setErr(mErr.message);
        return;
      }
      if (m) setMatch(m as Match);
      if (m?.status === "finished") {
        locked = true;
        if (interval) { clearInterval(interval); interval = null; }
      }

      const { data: ps } = await supabase
        .from("battle_match_players")
        .select("user_id,score,submitted_at")
        .eq("match_id", matchId);
      if (cancelled) return;
      const rows: Player[] = (ps ?? []) as Player[];

      const ids = rows.map((r) => r.user_id);
      if (ids.length) {
        const map = new Map<string, { full_name: string; avatar_url: string | null; email: string | null }>();
        if (user?.id && ids.includes(user.id)) {
          const { data: meProf } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url, email")
            .eq("id", user.id)
            .maybeSingle();
          if (meProf) map.set((meProf as any).id, {
            full_name: (meProf as any).full_name ?? "",
            avatar_url: (meProf as any).avatar_url ?? null,
            email: (meProf as any).email ?? null,
          });
        }
        const { data: oppRows } = await (supabase as any).rpc("bg_get_opponent_profile", { _match_id: matchId });
        const opp = Array.isArray(oppRows) ? oppRows[0] : oppRows;
        if (opp?.user_id) map.set(opp.user_id, {
          full_name: opp.full_name ?? "",
          avatar_url: opp.avatar_url ?? null,
          email: opp.email ?? null,
        });
        rows.forEach((r) => {
          const v = map.get(r.user_id);
          const raw = v?.full_name?.trim();
          const fallback = v?.email ? v.email.split("@")[0] : `Player ${String(r.user_id).slice(0, 4)}`;
          r.full_name = raw && raw.length > 0 ? raw : fallback;
          r.avatar_url = v?.avatar_url ?? null;
        });
      }

      // Bot match: only finalize once the bot's scheduled submission time
      // has passed. This is what produces the real "Waiting for opponent"
      // beat instead of an instant result page.
      if (m && (m as any).is_bot_match && m.status !== "finished") {
        const mine = rows.find((r) => r.user_id === user?.id);
        const botSubAt = (m as any).bot_submitted_at
          ? new Date((m as any).bot_submitted_at).getTime()
          : null;
        const botReady = botSubAt != null && botSubAt <= Date.now();
        if (mine?.submitted_at && botReady) {
          try {
            const finalized = await finalizeBot({
              data: {
                matchId,
                humanScore: Number(mine.score ?? 0),
                botScore: Number((m as any).bot_score ?? 0),
              },
            });
            if ((finalized as any)?.status === "finished") {
              // Re-load so the UI picks up the finished row.
              setTimeout(() => { locked = false; load(); }, 50);
              return;
            }
          } catch (e) {
            console.error("[battle-result] finalizeBot failed", e);
          }
        }
      }

      // Real 1v1: if waiting too long for opponent, try force-finalize so
      // a quitter can't strand the player on the waiting screen forever.
      if (m && !(m as any).is_bot_match && m.status !== "finished") {
        const mine = rows.find((r) => r.user_id === user?.id);
        if (mine?.submitted_at) {
          await (supabase as any)
            .rpc("bg_force_finalize_match", { _match_id: matchId })
            .catch(() => {});
        }
      }

      // Synthesize a bot "player" row for the bot match so the rest of the
      // UI is identical to a 1v1. Bot counts as "submitted" only after its
      // scheduled bot_submitted_at has actually elapsed.
      if (m && (m as any).is_bot_match) {
        const bot = botIdentity(matchId, (m as any).bot_name, (m as any).bot_avatar_url);
        const botSubmittedAt = (m as any).bot_submitted_at ?? null;
        const botHasSubmitted = botSubmittedAt
          ? new Date(botSubmittedAt).getTime() <= Date.now()
          : false;
        rows.push({
          user_id: "__bot__",
          score: botHasSubmitted ? Number((m as any).bot_score ?? 0) : 0,
          submitted_at: botHasSubmitted ? botSubmittedAt : null,
          full_name: bot.name,
          avatar_url: bot.avatar,
          is_bot: true,
        });
      }
      setPlayers(rows);

      if (m?.status === "finished" && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    load();
    interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [matchId, user?.id]);

  // Trigger confetti + wallet toast exactly once when the win is revealed.
  const toastedRef = useRef(false);
  useEffect(() => {
    if (revealed && match?.status === "finished" && match.winner_user_id === user?.id) {
      setShowCelebrate(true);
      if (!toastedRef.current) {
        toastedRef.current = true;
        const prize = Number(match.prize_amount ?? 0);
        if (prize > 0) {
          toast.success(`₹${prize.toFixed(0)} added to your winnings wallet`, {
            description: "Withdraw from Wallet → Withdraw any time.",
          });
        } else {
          toast.success("Victory! XP added to your profile.");
        }
      }
      const t = setTimeout(() => setShowCelebrate(false), 4500);
      return () => clearTimeout(t);
    }
  }, [revealed, match?.status, match?.winner_user_id, match?.prize_amount, user?.id]);

  if (loading || (!match && !err)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (err || !match) {
    return (
      <PageShell>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive">{err ?? "Match not found."}</p>
            <Button asChild variant="link">
              <Link to="/battlegrounds">Back to Battlegrounds</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const me = players.find((p) => p.user_id === user?.id);
  const opp = players.find((p) => p.user_id !== user?.id);
  const finished = match.status === "finished";
  const iSubmitted = !!me?.submitted_at;
  const oppSubmitted = !!opp?.submitted_at;
  const isTie = finished && !match.winner_user_id && me && opp && me.score === opp.score && !(match.is_bot_match && Number(match.stake) > 0);
  const won = finished && match.winner_user_id === user?.id;
  const lost = finished && !won && !isTie;
  const prize = Number(match.prize_amount ?? 0);

  // Stage 0 — my submit RPC is still in flight: the play page just navigated
  // here and our first poll hasn't reflected our own submitted_at yet. Show a
  // brief "Submitting your score" beat instead of jumping to "Submitting both
  // results" (which would be a lie — only one side has come in so far).
  if (!finished && !iSubmitted) {
    return <SubmittingSelfScreen />;
  }

  // Stage 1 — I'm done but the opponent isn't yet: show waiting screen.
  if (iSubmitted && !oppSubmitted && !finished) {
    return <WaitingForOpponent me={me!} opp={opp ?? null} stake={Number(match.stake)} />;
  }

  // Stage 2 — both sides in (or match finalized) but we haven't revealed yet.
  // Hold a "Submitting both results…" screen for 10s, then flip to reveal.
  return (
    <BothInGate
      bothReady={(iSubmitted && oppSubmitted) || finished}
      bothSubmittedAt={bothSubmittedAt}
      setBothSubmittedAt={setBothSubmittedAt}
      revealed={revealed}
      setRevealed={setRevealed}
    >
      <ResultReveal
        match={match}
        me={me ?? null}
        opp={opp ?? null}
        user={user}
        finished={finished}
        won={won}
        lost={lost}
        isTie={!!isTie}
        prize={prize}
        iSubmitted={iSubmitted}
        oppSubmitted={oppSubmitted}
        showCelebrate={showCelebrate}
      />
    </BothInGate>
  );
}

/* ───────────── 10-second "submitting both" hold before reveal ───────────── */

function BothInGate({
  bothReady,
  bothSubmittedAt,
  setBothSubmittedAt,
  revealed,
  setRevealed,
  children,
}: {
  bothReady: boolean;
  bothSubmittedAt: number | null;
  setBothSubmittedAt: (n: number | null) => void;
  revealed: boolean;
  setRevealed: (b: boolean) => void;
  children: ReactNode;
}) {
  const HOLD_MS = 10_000;
  useEffect(() => {
    if (bothReady && bothSubmittedAt == null) setBothSubmittedAt(Date.now());
  }, [bothReady, bothSubmittedAt, setBothSubmittedAt]);

  useEffect(() => {
    if (!bothReady || bothSubmittedAt == null || revealed) return;
    const elapsed = Date.now() - bothSubmittedAt;
    if (elapsed >= HOLD_MS) { setRevealed(true); return; }
    const t = setTimeout(() => setRevealed(true), HOLD_MS - elapsed);
    return () => clearTimeout(t);
  }, [bothReady, bothSubmittedAt, revealed, setRevealed]);

  if (!revealed) {
    return <SubmittingBothScreen />;
  }
  return <>{children}</>;
}

function SubmittingBothScreen() {
  return (
    <PageShell>
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-elegant">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold">Submitting both results</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tallying answers and locking in the prize. The winner appears in a moment.
          </p>
          <div className="mt-5 flex justify-center gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-wider text-muted-foreground">
            Please don't refresh
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function SubmittingSelfScreen() {
  return (
    <PageShell>
      <div className="flex min-h-[65vh] items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-elegant">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-extrabold">Submitting your score</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Locking your answers in. Hang tight for a moment.
          </p>
          <div className="mt-5 flex justify-center gap-1.5">
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/* ───────────────────────── Reveal hero + scoreboard ───────────────────────── */

function ResultReveal({
  match,
  me,
  opp,
  user,
  finished,
  won,
  lost,
  isTie,
  prize,
  iSubmitted,
  oppSubmitted,
  showCelebrate,
}: {
  match: Match;
  me: Player | null;
  opp: Player | null;
  user: { id: string } | null;
  finished: boolean;
  won: boolean;
  lost: boolean;
  isTie: boolean;
  prize: number;
  iSubmitted: boolean;
  oppSubmitted: boolean;
  showCelebrate: boolean;
}) {


  // Hero theme by outcome.
  const theme = won
    ? {
        from: "from-emerald-500",
        via: "via-teal-500",
        to: "to-emerald-700",
        Icon: Trophy,
        title: "Victory!",
        sub:
          prize > 0
            ? `You won ₹${prize.toFixed(0)} — added to your winnings wallet.`
            : "Glory is yours. XP awarded.",
      }
    : lost
      ? {
          from: "from-rose-500",
          via: "via-pink-500",
          to: "to-rose-700",
          Icon: Frown,
          title: "So close!",
          sub: "Keep practising — your next battle is one tap away.",
        }
      : isTie
        ? {
            from: "from-amber-500",
            via: "via-orange-500",
            to: "to-amber-700",
            Icon: Handshake,
            title: "It's a tie!",
            sub: "Stakes refunded. Rematch?",
          }
        : {
            from: "from-primary",
            via: "via-blue-500",
            to: "to-blue-700",
            Icon: Swords,
            title: "Battle in progress",
            sub: "Hold tight — we'll show the result the moment it lands.",
          };

  const Hero = theme.Icon;

  return (
    <PageShell>
      {showCelebrate && <ConfettiBurst />}

      <div
        className={cn(
          "relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-primary-foreground shadow-elegant sm:p-8",
          theme.from,
          theme.via,
          theme.to,
        )}
      >
        {/* Glow rings (decorative) */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-10 h-44 w-44 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col items-center text-center">
          <div
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 backdrop-blur",
              won && "animate-[pulse_1.2s_ease-in-out_infinite]",
            )}
          >
            <Hero className="h-10 w-10 animate-scale-in" />
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
            {finished
              ? won
                ? "Congratulations"
                : lost
                  ? "Better luck next time"
                  : "Tie game"
              : "Live"}
          </div>
          <h1 className="mt-2 text-4xl font-black leading-tight tracking-tight animate-fade-in">
            {theme.title}
          </h1>
          <p className="mt-2 max-w-sm text-sm text-white/90">{theme.sub}</p>
          {finished && won && prize > 0 && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/25 px-5 py-2.5 text-lg font-extrabold backdrop-blur animate-scale-in">
              <Crown className="h-5 w-5" /> +₹{prize.toFixed(0)}
            </div>
          )}
        </div>
      </div>

      {/* Scoreboard with avatars */}
      <Card className="mt-4 border-0 shadow-soft">
        <CardContent className="p-5">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Scoreboard · stake{" "}
            {match.stake > 0 ? `₹${Number(match.stake).toFixed(0)}` : "Free"}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <PlayerCard
              label="You"
              name={me?.full_name ?? "You"}
              avatar={avatarUrl(me?.full_name ?? user?.id ?? "you", me?.avatar_url ?? null)}
              score={me?.score ?? 0}
              winner={!!won}
              highlight
              waiting={!iSubmitted && !finished}
            />
            <div className="text-2xl font-black tracking-tighter text-muted-foreground">VS</div>
            <PlayerCard
              label="Opponent"
              name={opp?.full_name ?? (finished ? "Opponent" : "Waiting…")}
              avatar={avatarUrl(opp?.full_name ?? opp?.user_id ?? "opp", opp?.avatar_url ?? null)}
              score={opp?.score ?? 0}
              winner={finished && !!opp && !isTie && !won}
              waiting={!oppSubmitted && !finished}
            />
          </div>
          {finished && (
            <div className="mt-4 text-center text-xs text-muted-foreground">
              {isTie
                ? "Both played brilliantly — equal score."
                : won
                  ? `You beat ${opp?.full_name ?? "your opponent"} by ${Math.abs((me?.score ?? 0) - (opp?.score ?? 0)).toFixed(0)} points.`
                  : `${opp?.full_name ?? "Opponent"} edged you by ${Math.abs((me?.score ?? 0) - (opp?.score ?? 0)).toFixed(0)} points.`}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild variant="outline" className="sm:min-w-[160px]">
          <Link to="/profile">Open wallet</Link>
        </Button>
        <Button asChild className="bg-gradient-primary sm:min-w-[220px]">
          <Link to="/battlegrounds">
            <Swords className="mr-2 h-4 w-4" /> Play another battle
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}

/* ───────────────────────── Waiting for opponent ───────────────────────── */

function WaitingForOpponent({
  me,
  opp,
  stake,
}: {
  me: Player;
  opp: Player | null;
  stake: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = me.submitted_at ? new Date(me.submitted_at).getTime() : Date.now();
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(id);
  }, [me.submitted_at]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <PageShell>
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/90 via-accent/70 to-primary/80 p-8 text-primary-foreground shadow-elegant">
        <div className="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-8 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

        <div className="relative text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
            <Hourglass className="h-3.5 w-3.5 animate-pulse" /> Waiting for opponent
          </div>
          <h1 className="mt-3 text-3xl font-extrabold">You finished first!</h1>
          <p className="mt-2 text-sm text-white/90">
            Nicely done. Sit tight while your opponent wraps up — we'll declare the winner the
            moment they submit.
          </p>

          <div className="mt-6 flex items-center justify-center gap-6">
            {/* You — submitted */}
            <PlayerOrb
              name={me.full_name ?? "You"}
              avatar={avatarUrl(me.full_name ?? me.user_id, me.avatar_url ?? null)}
              caption="Submitted"
              done
            />
            <div className="text-3xl font-black tracking-tighter opacity-80">VS</div>
            {/* Opponent — still playing */}
            <PlayerOrb
              name={opp?.full_name ?? "Opponent"}
              avatar={avatarUrl(opp?.full_name ?? opp?.user_id ?? "opp", opp?.avatar_url ?? null)}
              caption="Still answering"
              pulsing
            />
          </div>

          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-black/25 px-4 py-2 font-mono text-sm font-bold tabular-nums backdrop-blur">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {mm}:{ss}
          </div>

          <div className="mt-2 text-xs text-white/80">
            Stake {stake > 0 ? `₹${stake.toFixed(0)}` : "Free"}
          </div>
        </div>
      </div>

      <Card className="mt-4 border-0 shadow-soft">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm text-muted-foreground">
              While you wait — every second your opponent takes is a second you stay ahead. The
              page will switch to the result automatically.
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-center">
        <Button asChild variant="ghost" size="sm">
          <Link to="/battlegrounds">
            Back to Battlegrounds <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </PageShell>
  );
}

function PlayerOrb({
  name,
  avatar,
  caption,
  done,
  pulsing,
}: {
  name: string;
  avatar: string | null;
  caption: string;
  done?: boolean;
  pulsing?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white/40 bg-white/15 text-2xl font-extrabold backdrop-blur",
          pulsing && "animate-[pulse_1.6s_ease-in-out_infinite] ring-2 ring-white/60 ring-offset-2 ring-offset-transparent",
          done && "border-emerald-300",
        )}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="mt-2 max-w-[6rem] truncate text-xs font-bold">{name}</div>
      <div
        className={cn(
          "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
          done ? "bg-emerald-400/30" : "bg-white/15",
        )}
      >
        {caption}
      </div>
    </div>
  );
}

/* ───────────────────────── Scoreboard player card ───────────────────────── */

function PlayerCard({
  label,
  name,
  avatar,
  score,
  winner,
  highlight,
  waiting,
}: {
  label: string;
  name: string;
  avatar: string | null;
  score: number;
  winner?: boolean;
  highlight?: boolean;
  waiting?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-4 text-center shadow-sm",
        highlight ? "border-primary/40 bg-primary/5" : "border-border",
        winner && "border-emerald-500/60 bg-emerald-500/10 ring-2 ring-emerald-500/30",
      )}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary text-base font-extrabold">
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold">{name}</div>
      <div className="mt-2 text-3xl font-extrabold tabular-nums">
        {waiting ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          score.toFixed(0)
        )}
      </div>
      {winner && (
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
          <Trophy className="h-3 w-3" /> Winner
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── CSS-only confetti burst ───────────────────────── */

function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const duration = 2.4 + Math.random() * 1.6;
        const rotate = Math.random() * 360;
        const size = 6 + Math.random() * 8;
        const colors = ["#f43f5e", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#06b6d4"];
        const color = colors[i % colors.length];
        return { id: i, left, delay, duration, rotate, size, color };
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute -top-6 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s ${p.delay}s linear forwards`,
            borderRadius: 2,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
