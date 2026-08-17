import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  Loader2, Swords, ArrowRight, Flame, Users, Trophy, X, Zap, BookOpen, Clock, History, Atom, FlaskConical, Leaf, Dna,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { avatarUrl } from "@/lib/avatar";
import { avatarForName } from "@/lib/neetiq-avatars";
import { SUBJECT_CHAPTERS, getSubjectRotation, type BattleSubject } from "@/data/battleground-chapters";
import { useServerFn } from "@tanstack/react-start";
import { getBattleQueueState, matchWithBot } from "@/lib/battleground-match.functions";

const supabase = supabaseTyped as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export const Route = createFileRoute("/battlegrounds")({
  head: () => ({ meta: [{ title: "Battlegrounds — Free Subject Battles" }] }),
  component: BattlegroundsPage,
});

const SUBJECTS: { key: BattleSubject; label: string; icon: any; tint: string; iconBg: string; text: string }[] = [
  { key: "Physics",   label: "Physics",   icon: Atom,         tint: "from-sky-500/25 to-blue-500/15",       iconBg: "bg-sky-500/20 text-sky-600 dark:text-sky-300",           text: "text-sky-700 dark:text-sky-300" },
  { key: "Chemistry", label: "Chemistry", icon: FlaskConical, tint: "from-orange-500/25 to-amber-500/15",   iconBg: "bg-orange-500/20 text-orange-600 dark:text-orange-300",  text: "text-orange-700 dark:text-orange-300" },
  { key: "Biology",   label: "Biology",   icon: Leaf,         tint: "from-emerald-500/25 to-teal-500/15",   iconBg: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300" },
];
// (Dna import retained by other components; unused reference safeguard below.)
void Dna;

type Opponent = { user_id: string; full_name: string | null; avatar_url: string | null; is_bot?: boolean } | null;
type QueueState =
  | { kind: "idle" }
  | { kind: "waiting"; subject: BattleSubject; since: number }
  | { kind: "matched"; matchId: string; testId: string; subject: BattleSubject; opponent: Opponent; countdownStartsAt: number };

const BOT_NAMES = ["Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova", "Tara Flux"];
function fallbackBotName(matchId: string, preferred?: string | null) {
  const clean = preferred?.trim();
  if (clean && !["opponent", "bot opponent"].includes(clean.toLowerCase())) return clean;
  const n = Array.from(matchId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return BOT_NAMES[n % BOT_NAMES.length];
}

function seededNumber(seed: string, min: number, max: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const r = (h >>> 0) / 4294967295;
  return Math.round(min + r * (max - min));
}

function realisticLiveCount(raw?: number | null) {
  const now = new Date();
  const istHour = (now.getUTCHours() + 5 + (now.getUTCMinutes() >= 30 ? 1 : 0)) % 24;
  const day = now.toISOString().slice(0, 10);
  const bucket = Math.floor(now.getUTCMinutes() / 5);
  const ranges = istHour >= 0 && istHour < 5 ? [7, 24]
    : istHour < 8 ? [18, 52]
      : istHour < 12 ? [65, 145]
        : istHour < 17 ? [90, 210]
          : istHour < 23 ? [120, 280]
            : [30, 80];
  const base = seededNumber(`${day}:${istHour}:${bucket}`, ranges[0], ranges[1]);
  const modestReal = Math.max(0, Math.min(35, Number(raw ?? 0)));
  return Math.min(ranges[1] + 18, base + Math.floor(modestReal * 0.35));
}

function syntheticLeaderboardRows() {
  const day = new Date().toISOString().slice(0, 10);
  const istHour = (new Date().getUTCHours() + 5 + Math.floor((new Date().getUTCMinutes() + 30) / 60)) % 24;
  const bucket15 = Math.floor(new Date().getUTCMinutes() / 15);
  const dayProgress = istHour + bucket15 / 4;
  return BOT_NAMES.concat(["Arjun Nair", "Anaya Verma", "Rohan Pillai", "Diya Khanna"]).map((name, i) => {
    const winsBase = seededNumber(`${day}:${name}:w`, Math.max(3, 13 - i), Math.max(6, 21 - i));
    const winsGrowth = seededNumber(`${day}:${name}:wg:${istHour}`, 0, 3);
    const wins = winsBase + winsGrowth;
    const battles = wins + seededNumber(`${day}:${name}:b:${istHour}`, 3, 9);
    const xpBase = seededNumber(`${day}:${name}:x`, 60, 320);
    const xp = xpBase + Math.round(wins * 10) + seededNumber(`${day}:${name}:jit:${istHour}:${bucket15}`, 0, 15) + Math.round(dayProgress);
    return { display_name: name, avatar_url: avatarForName(name), wins, battles, xp };
  });
}

async function fetchOpponent(matchId: string, _meId: string): Promise<Opponent> {
  const { data: oppRows, error } = await supabase.rpc("bg_get_opponent_profile", { _match_id: matchId });
  if (error) { console.error("[bg] bg_get_opponent_profile failed", error); return null; }
  const opp = Array.isArray(oppRows) ? oppRows[0] : oppRows;
  if (!opp?.user_id) return null;
  const rawName = (opp.full_name as string | null)?.trim();
  const email = (opp.email as string | null) ?? undefined;
  const fallback = email ? email.split("@")[0] : `Player ${String(opp.user_id).slice(0, 4)}`;
  return { user_id: opp.user_id, full_name: rawName && rawName.length > 0 ? rawName : fallback, avatar_url: (opp.avatar_url as string | null) ?? null };
}

function BattlegroundsPage() {
  const { user, profile, loading } = useAuth();
  const nav = useNavigate();
  const [state, setState] = useState<QueueState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestBot = useServerFn(matchWithBot);
  const readQueue = useServerFn(getBattleQueueState);
  const [leaderboard, setLeaderboard] = useState<{ rank: number; display_name: string; avatar_url: string | null; wins: number; battles: number; xp: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("bg_daily_leaderboard", { _limit: 10 });
      const seen = new Set<string>();
      const cleaned: { display_name: string; avatar_url: string | null; wins: number; battles: number; xp: number }[] = [];
      if (!error && Array.isArray(data)) {
        for (const r of data as any[]) {
          const wins = Math.max(0, Number(r.wins ?? 0));
          const battles = Math.max(wins, Number(r.battles ?? 0));
          const xp = wins * 10;
          const name = String(r.display_name ?? "Player");
          const k = name.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          cleaned.push({ display_name: name, avatar_url: (r.avatar_url as string | null) ?? null, wins, battles, xp });
        }
      }
      for (const f of syntheticLeaderboardRows()) {
        if (cleaned.length >= 10) break;
        if (seen.has(f.display_name.toLowerCase())) continue;
        cleaned.push({ ...f, avatar_url: null });
        seen.add(f.display_name.toLowerCase());
      }
      cleaned.sort((a, b) => b.xp - a.xp || b.wins - a.wins);
      if (cancelled) return;
      setLeaderboard(cleaned.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r })));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchLive = async () => {
      const { data: live } = await supabase.rpc("bg_live_count");
      if (cancelled) return;
      setLiveCount(realisticLiveCount((live as any)?.players));
    };
    fetchLive();
    const id = setInterval(fetchLive, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user?.id]);

  useEffect(() => {
    if (state.kind !== "waiting" || !user) return;
    const subject = state.subject;
    const since = state.since;
    let stopped = false;
    let botAttempts = 0;
    let botResolving = false;

    const applyMatch = (
      match: { matchId: string; testId: string | null; countdownStartsAt: string | null; isBot: boolean; botName: string | null; botAvatarUrl: string | null },
      opponent: Opponent,
    ) => {
      if (!match.testId) return false;
      const anchor = match.countdownStartsAt ? new Date(match.countdownStartsAt).getTime() : Date.now() + 10_000;
      const botName = fallbackBotName(match.matchId, match.botName);
      setSearchError(null);
      setState({
        kind: "matched",
        matchId: match.matchId,
        testId: match.testId,
        subject,
        opponent: match.isBot
          ? { user_id: "__bot__", full_name: botName, avatar_url: match.botAvatarUrl ?? avatarForName(botName), is_bot: true }
          : opponent,
        countdownStartsAt: anchor,
      });
      return true;
    };

    pollRef.current = setInterval(async () => {
      if (stopped || botResolving) return;
      const elapsed = (Date.now() - since) / 1000;

      // 1) A real player may already have matched us — read through the server
      //    so RLS can never hide the match row and strand us here.
      try {
        const q = await readQueue({ data: {} } as never);
        if (q?.status === "matched" && q.match && applyMatch(q.match, (q.opponent as Opponent) ?? null)) return;
      } catch (e) {
        console.error("[bg] queue state read failed", e);
      }

      // 2) After 4s with no human, fall back to a bot. Retry a few times with
      //    backoff instead of firing (and toasting) every single tick.
      if (elapsed >= 4 && botAttempts < 3) {
        botAttempts++;
        botResolving = true;
        try {
          const res = await requestBot({ data: { subject } });
          if (res?.ok && res.match) {
            applyMatch(res.match, null);
            return;
          }
          if (botAttempts >= 3) {
            setSearchError(res?.error ?? "Could not find an opponent right now.");
          }
        } catch (e) {
          if (botAttempts >= 3) {
            setSearchError(e instanceof Error ? e.message : "Could not find an opponent right now.");
          }
        } finally {
          botResolving = false;
        }
      }
    }, 2000);

    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, user?.id, state.kind === "waiting" ? state.since : 0]);

  useEffect(() => {
    if (state.kind !== "matched") return;
    const tickId = setInterval(() => {
      if (Date.now() >= state.countdownStartsAt) {
        clearInterval(tickId);
        nav({ to: "/battle/$matchId/play", params: { matchId: state.matchId } });
      }
    }, 250);
    return () => clearInterval(tickId);
  }, [state.kind, state.kind === "matched" ? state.countdownStartsAt : 0, state.kind === "matched" ? state.matchId : ""]);

  const rotations = useMemo(() => {
    const now = Date.now();
    return Object.fromEntries(SUBJECTS.map((s) => [s.key, getSubjectRotation(s.key, now)])) as Record<BattleSubject, ReturnType<typeof getSubjectRotation>>;
  }, [Math.floor(Date.now() / 60_000)]);

  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  async function joinSubject(subject: BattleSubject) {
    setBusy(true);
    setSearchError(null);
    // Clear any stale queue row from a previous session so bg_join_queue
    // doesn't hit the unique(user_id) waiting constraint and return an error.
    try { await supabase.rpc("bg_leave_queue"); } catch { /* best-effort */ }
    // stake=0 → free battle. Pass subject so server picks a matching test.
    let data: any = null;
    let error: any = null;
    {
      const r = await supabase.rpc("bg_join_queue", { _stake: 0, _subject: subject });
      data = r.data; error = r.error;
      if (error && /_subject|argument|does not exist|schema cache/i.test(error.message ?? "")) {
        const r2 = await supabase.rpc("bg_join_queue", { _stake: 0 });
        data = r2.data; error = r2.error;
      }
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const res = data as { status: string; match_id?: string; test_id?: string } | null;
    if (res?.status === "matched" && res.match_id && res.test_id) {
      try {
        const opp = await fetchOpponent(res.match_id, user!.id);
        const { data: m } = await supabase.from("battle_matches").select("countdown_starts_at").eq("id", res.match_id).maybeSingle();
        const anchor = m?.countdown_starts_at ? new Date(m.countdown_starts_at).getTime() : Date.now() + 10_000;
        setState({ kind: "matched", matchId: res.match_id, testId: res.test_id, subject, opponent: opp, countdownStartsAt: anchor });
      } catch (e) {
        console.error("[bg] post-join hydration failed", e);
        nav({ to: "/battle/$matchId/play", params: { matchId: res.match_id } });
      }
    } else {
      setState({ kind: "waiting", subject, since: Date.now() });
    }
  }

  async function cancelQueue() {
    setBusy(true);
    await supabase.rpc("bg_leave_queue");
    setBusy(false);
    setSearchError(null);
    setState({ kind: "idle" });
  }

  return (
    <PageShell>
      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/90 via-accent/75 to-primary/80 p-6 text-primary-foreground shadow-soft sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
              <Flame className="h-3.5 w-3.5" /> 1v1 Subject Battles
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Battlegrounds</h1>
            <p className="mt-2 max-w-sm text-sm text-white/90">
              Pick a subject. We match you with a live opponent on the current hour's chapter. Win to earn +10 XP.
            </p>
          </div>
          <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur sm:flex">
            <Swords className="h-10 w-10" strokeWidth={1.5} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 font-semibold backdrop-blur">
            <Trophy className="h-3.5 w-3.5" /> XP: {Number(profile?.xp_total ?? 0)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/30 px-3 py-1.5 font-semibold backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {liveCount === null ? "…" : liveCount} live now
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 font-semibold backdrop-blur">
            Free to play · No entry fee
          </span>
        </div>
      </div>

      {/* How it works */}
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: BookOpen, label: "Pick subject" },
          { icon: Users,   label: "Find opponent" },
          { icon: Trophy,  label: "Win +10 XP" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
            <s.icon className="mx-auto h-5 w-5 text-primary" />
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Matched banner */}
      {state.kind === "matched" && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 p-6 text-white shadow-elegant">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
              <Zap className="h-3.5 w-3.5" /> Opponent found
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              <div className="flex flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white/40 bg-white/15 text-xl font-extrabold backdrop-blur">
                  <img src={avatarUrl(profile?.full_name ?? user?.id ?? "you", profile?.avatar_url ?? null)} alt="You" className="h-full w-full object-cover" />
                </div>
                <div className="mt-1 max-w-[6rem] truncate text-xs font-bold">You</div>
              </div>
              <div className="text-3xl font-black tracking-tighter opacity-90">VS</div>
              <div className="flex flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white/40 bg-white/15 text-xl font-extrabold backdrop-blur">
                  <img src={avatarUrl(state.opponent?.full_name ?? state.opponent?.user_id ?? "opp", state.opponent?.avatar_url ?? null)} alt={state.opponent?.full_name ?? "Opponent"} className="h-full w-full object-cover" />
                </div>
                <div className="mt-1 max-w-[6rem] truncate text-xs font-bold">{state.opponent?.full_name ?? "Opponent"}</div>
              </div>
            </div>
            {(() => {
              const secs = Math.max(0, Math.ceil((state.countdownStartsAt - Date.now()) / 1000));
              return (
                <>
                  <div className="mt-5 flex items-baseline justify-center gap-2">
                    <span className="text-6xl font-black tabular-nums tracking-tighter animate-scale-in">{secs}</span>
                    <span className="text-sm font-bold uppercase tracking-wider opacity-90">starting in</span>
                  </div>
                  <div className="mt-3 text-sm font-semibold">{state.subject} · 5 questions · Win +10 XP</div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Waiting */}
      {state.kind === "waiting" && (
        <div className="mt-6 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-primary/5 p-6 shadow-elegant">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold">Searching {state.subject} opponent…</div>
              <div className="text-xs text-muted-foreground">{Math.floor((Date.now() - state.since) / 1000)}s elapsed</div>
              {searchError && (
                <div className="mt-1 text-xs font-medium text-destructive">{searchError}</div>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {searchError && (
                <Button size="sm" onClick={() => joinSubject(state.subject)} disabled={busy}>
                  Retry
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={cancelQueue} disabled={busy}><X className="mr-1 h-4 w-4" /> Cancel</Button>
            </div>
          </div>

        </div>
      )}

      {state.kind === "idle" && (
        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline" className="flex-1">
            <Link to="/battlegrounds/history"><History className="mr-2 h-4 w-4" /> View battle history</Link>
          </Button>
        </div>
      )}

      {/* Subject tiles */}
      {state.kind === "idle" && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Pick your battleground</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SUBJECTS.map((s) => {
              const rot = rotations[s.key];
              const ms = Math.max(0, rot.nextChangeAt - Date.now());
              const h = Math.floor(ms / 3600000); const mi = Math.floor((ms % 3600000) / 60000);
              return (
                <button
                  key={s.key}
                  onClick={() => joinSubject(s.key)}
                  disabled={busy}
                  className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${s.tint} p-0 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant disabled:opacity-60`}
                >
                  <div className="flex items-start gap-3 p-4">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${s.iconBg} shadow-sm`}>
                      <s.icon className="h-7 w-7" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-base font-extrabold ${s.text}`}>{s.label}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground backdrop-blur">
                          <Clock className="h-3 w-3" /> {h}h {mi}m
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current chapter</div>
                      <div className="truncate text-sm font-bold text-foreground">{rot.chapter}</div>
                      <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        Battle now <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            5 questions · winner earns +10 XP · losing costs no XP
          </p>
        </section>
      )}

      {/* Leaderboard */}
      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Today's Leaderboard</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Last 24h · resets daily</span>
        </div>
        {leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
            No battles in the last 24h yet. Be the first — pick a subject above.
          </div>
        ) : (
          <ol className="space-y-2">
            {leaderboard.map((row) => {
              const medal =
                row.rank === 1 ? "bg-amber-400/20 text-amber-700 border-amber-400/40" :
                row.rank === 2 ? "bg-zinc-300/30 text-zinc-700 border-zinc-300/40" :
                row.rank === 3 ? "bg-orange-400/20 text-orange-700 border-orange-400/40" :
                "bg-card text-muted-foreground border-border";
              return (
                <li key={`${row.rank}-${row.display_name}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
                  <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold ${medal}`}>{row.rank}</span>
                  <img src={row.avatar_url ?? avatarUrl(row.display_name, null)} alt={row.display_name} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-bold">{row.display_name}</div>
                    <div className="text-[11px] text-muted-foreground">{row.wins}W · {row.battles} battles</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">+{row.xp} XP</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">earned</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Available chapters (per subject) */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Chapter rotation</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SUBJECTS.map((s) => (
            <div key={s.key} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <s.icon className={`h-4 w-4 ${s.text}`} />
                <div className={`text-sm font-extrabold ${s.text}`}>{s.label}</div>
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {SUBJECT_CHAPTERS[s.key].slice(0, 8).map((ch) => (
                  <li key={ch} className="truncate">• {ch}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
