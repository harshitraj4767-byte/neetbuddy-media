import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Swords, Clock, Check, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RichText } from "@/components/rich-text";
import { useAuth } from "@/hooks/use-auth";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { avatarUrl } from "@/lib/avatar";
import { useServerFn } from "@tanstack/react-start";
import { scheduleBotMatchSubmission, submitBattleAttempt } from "@/lib/battle-bot-schedule.functions";
import { avatarForName } from "@/lib/neetiq-avatars";
import { AntiCheatGate, hasAckedAntiCheat } from "@/components/anti-cheat-gate";
import { LoadingScreen } from "@/components/loading-screen";
import { useForceLightMode } from "@/hooks/use-force-light";


const supabase = supabaseTyped as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const DEFAULT_QUESTION_COUNT = 5;
const HIGH_STAKE_QUESTION_COUNT = 10; // ₹10 and ₹25 battles use 10 questions
const PER_Q_SECONDS = 35;
const REVEAL_MS = 1400; // how long to show correct/wrong before auto-advance
const AWAY_GRACE_MS = 10_000; // tab/screen leaves -> auto-submit after 10s

function questionCountForStake(stake: number) {
  return stake >= 10 ? HIGH_STAKE_QUESTION_COUNT : DEFAULT_QUESTION_COUNT;
}

export const Route = createFileRoute("/battle/$matchId/play")({
  head: () => ({ meta: [{ title: "Battle — 1v1 Quiz" }] }),
  component: BattlePlayPage,
});

type Question = { id: string; text: string; options: string[]; correct_index: number };
type Match = {
  id: string;
  test_id: string;
  stake: number;
  status: string;
  is_bot_match: boolean;
  bot_name: string | null;
  bot_avatar_url: string | null;
  countdown_starts_at: string | null;
};
type OppView = {
  name: string;
  avatar: string | null;
  score: number;
  progress: number;   // questions answered (any answer)
  submitted: boolean;
  isBot: boolean;
};

const BOT_NAMES = ["Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova", "Tara Flux"];
function botIdentity(matchId: string, name?: string | null, avatar?: string | null) {
  const cleanName = name?.trim();
  const n = Array.from(matchId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const displayName = cleanName && !["opponent", "bot opponent"].includes(cleanName.toLowerCase()) ? cleanName : BOT_NAMES[n % BOT_NAMES.length];
  return { name: displayName, avatar: avatar?.trim() || avatarForName(displayName) };
}

// Plan a humanlike bot run. Bot's per-question delay is FIXED to an average of
// ~15s regardless of how fast the human is going (12-18s window per question).
// Accuracy stays varied (~50-75%) so wins/losses still feel organic.
function planBotRun(qCount: number) {
  const accuracy = 0.5 + Math.random() * 0.25; // 0.50..0.75
  return Array.from({ length: qCount }).map(() => {
    // 12-18s per question, mean ~15s. Independent of user speed.
    const delay = 12000 + Math.floor(Math.random() * 6001);
    return { delayMs: delay, correct: Math.random() < accuracy };
  });
}

function storageKey(matchId: string) { return `bg_play_v2_${matchId}`; }
type SavedState = {
  answers: Record<string, number>;
  revealed: Record<string, boolean>;
  idx: number;
  submitted?: boolean;
  /** Per-question deadline (epoch ms) so timer survives refresh. */
  deadlines?: Record<string, number>;
};
function loadSaved(matchId: string): SavedState | null {
  if (typeof window === "undefined") return null;
  try { const raw = localStorage.getItem(storageKey(matchId)); return raw ? JSON.parse(raw) as SavedState : null; }
  catch { return null; }
}
function saveState(matchId: string, s: SavedState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(storageKey(matchId), JSON.stringify(s)); } catch { /* noop */ }
}

function stableHash(value: unknown): string {
  const stableStringify = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
    if (v && typeof v === "object") {
      return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  const s = stableStringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}


function normalizeBattleQuestion(raw: any): Question | null {
  if (!raw?.id) return null;
  const options = Array.isArray(raw.options)
    ? raw.options.filter((option: unknown): option is string => typeof option === "string")
    : [];
  const correctIndex = Number(raw.correct_index);
  if (!options.length || Number.isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    console.error("[battle] invalid question row", {
      questionId: raw.id,
      optionsLength: options.length,
      correctIndex: raw.correct_index,
    });
    return null;
  }
  return {
    id: String(raw.id),
    text: typeof raw.text === "string" ? raw.text : "",
    options,
    correct_index: correctIndex,
  };
}

function BattlePlayPage() {
  // Exam surfaces stay in light mode so question images stay legible.
  useForceLightMode();
  const { matchId } = Route.useParams();
  const { user, profile, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const scheduleBot = useServerFn(scheduleBotMatchSubmission);
  const submitBattle = useServerFn(submitBattleAttempt);

  const [match, setMatch] = useState<Match | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const initial = useMemo(() => loadSaved(matchId), [matchId]);
  const [answers, setAnswers] = useState<Record<string, number>>(initial?.answers ?? {});
  const [idx, setIdx] = useState(initial?.idx ?? 0);
  const [secsLeft, setSecsLeft] = useState(PER_Q_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!initial?.submitted);

  const [opp, setOpp] = useState<OppView | null>(null);
  const oppRef = useRef<OppView | null>(null);
  useEffect(() => { oppRef.current = opp; }, [opp]);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>(initial?.revealed ?? {});
  const [deadlines, setDeadlines] = useState<Record<string, number>>(initial?.deadlines ?? {});
  const [pulseMe, setPulseMe] = useState(0);
  const [pulseOpp, setPulseOpp] = useState(0);
  const battleStartedAtRef = useRef(Date.now());
  const lastAnswerAtRef = useRef<number | null>(null);
  const antiCheatRef = useRef({ awayEvents: 0, blockedEvents: 0, resizeEvents: 0, veryFastAnswers: 0 });

  // Refs mirror state for sync-time reads in unload handlers and effect bodies.
  // Without these, the pagehide handler can close over a stale `submitted=false`
  // value and call bg_forfeit_match AFTER the player has successfully submitted,
  // wrongly handing the win + prize to the opponent.
  const submittedRef = useRef(!!initial?.submitted);
  const submittingRef = useRef(false);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  // Persist quiz state on every change (anti-cheat: on refresh user resumes with locked answers AND timer).
  useEffect(() => {
    saveState(matchId, { answers, revealed, idx, submitted, deadlines });
  }, [matchId, answers, revealed, idx, submitted, deadlines]);


  useEffect(() => { if (!authLoading && !user) nav({ to: "/login" }); }, [user, authLoading, nav]);

  // Load match + questions, and block re-attempt if already submitted in DB.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: m, error: mErr } = await supabase
        .from("battle_matches")
        .select("id,test_id,stake,status,is_bot_match,bot_name,bot_avatar_url,countdown_starts_at")
        .eq("id", matchId).maybeSingle();
      if (cancelled) return;
      if (mErr || !m) { setErr(mErr?.message ?? "Match not found"); return; }
      setMatch(m as Match);
      if (m.status === "finished") { nav({ to: "/battle/$matchId/result", params: { matchId } }); return; }

      // Anti-cheat: if this user has already submitted, redirect to result/waiting page.
      const { data: meRow } = await supabase
        .from("battle_match_players")
        .select("submitted_at")
        .eq("match_id", matchId).eq("user_id", user.id).maybeSingle();
      if ((meRow as any)?.submitted_at) {
        nav({ to: "/battle/$matchId/result", params: { matchId } });
        return;
      }

      const { data: test } = await supabase.from("tests").select("question_ids").eq("id", m.test_id).maybeSingle();
      const qCountTarget = questionCountForStake(Number(m.stake ?? 0));
      const qids: string[] = ((test as any)?.question_ids ?? []).slice(0, qCountTarget);
      if (!qids.length) { setErr("No questions in this match"); return; }
      const { data: qs, error: qErr } = await supabase.from("questions").select("id,text,options,correct_index").in("id", qids);
      if (qErr) {
        console.error("[battle] failed to load questions", qErr, { matchId, testId: m.test_id, qids });
        setErr(qErr.message ?? "Could not load battle questions");
        return;
      }
      const questionMap = new Map(((qs ?? []) as any[]).map((q) => [q.id, q]));
      const ordered = qids
        .map((id) => normalizeBattleQuestion(questionMap.get(id)))
        .filter((q): q is Question => Boolean(q));
      if (ordered.length !== qids.length) {
        console.error("[battle] dropped malformed questions", {
          matchId,
          requested: qids,
          loadedCount: ordered.length,
        });
      }
      if (cancelled) return;
      if (!ordered.length) {
        setErr("This battle has invalid questions. Please start a new match.");
        return;
      }
      setQuestions(ordered);
    })();
    return () => { cancelled = true; };
  }, [matchId, user?.id]);

  // Sync countdown
  const startAt = useMemo(
    () => (match?.countdown_starts_at ? new Date(match.countdown_starts_at).getTime() : 0),
    [match?.countdown_starts_at],
  );
  const [waitForStart, setWaitForStart] = useState(true);
  useEffect(() => {
    if (!startAt) { setWaitForStart(false); return; }
    const id = setInterval(() => {
      if (Date.now() >= startAt) { setWaitForStart(false); clearInterval(id); }
    }, 200);
    return () => clearInterval(id);
  }, [startAt]);

  // Per-question countdown — deadline-based so refresh does NOT reset timer.
  useEffect(() => {
    if (waitForStart || submitted || !questions.length) return;
    const q = questions[idx];
    if (!q || revealed[q.id]) return;
    // Anchor a deadline once per question; persisted via saveState so a
    // page reload resumes from the same wall-clock deadline (anti-cheat).
    let deadline = deadlines[q.id];
    if (!deadline) {
      deadline = Date.now() + PER_Q_SECONDS * 1000;
      setDeadlines((d) => ({ ...d, [q.id]: deadline! }));
    }
    const compute = () => Math.max(0, Math.ceil((deadline! - Date.now()) / 1000));
    setSecsLeft(compute());
    const id = setInterval(() => {
      const left = compute();
      setSecsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        setRevealed((r) => ({ ...r, [q.id]: true }));
        setTimeout(() => setIdx((i) => Math.min(i + 1, questions.length)), REVEAL_MS);
      }
    }, 500);
    return () => clearInterval(id);
  }, [idx, waitForStart, submitted, questions, revealed, deadlines]);


  // ───────── Bot simulator (live, per question) ─────────
  const botPlanRef = useRef<ReturnType<typeof planBotRun> | null>(null);
  const botStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (!match?.is_bot_match || !questions.length || waitForStart) return;
    if (!botPlanRef.current) botPlanRef.current = planBotRun(questions.length);
    const bot = botIdentity(match.id, match.bot_name, match.bot_avatar_url);

    // Schedule each bot answer relative to match start.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const baseTime = Math.max(Date.now(), startAt || Date.now());
    botStartRef.current = baseTime;
    let cumulative = 0;
    botPlanRef.current.forEach((step, i) => {
      cumulative += step.delayMs;
      const fireAt = baseTime + cumulative;
      const wait = Math.max(0, fireAt - Date.now());
      timers.push(setTimeout(() => {
        setOpp((o) => {
          const next: OppView = {
            name: o?.name ?? bot.name,
            avatar: o?.avatar ?? bot.avatar,
            score: (o?.score ?? 0) + (step.correct ? 1 : 0),
            progress: Math.max(o?.progress ?? 0, i + 1),
            submitted: i === questions.length - 1,
            isBot: true,
          };
          return next;
        });
        if (step.correct) setPulseOpp((c) => c + 1);
      }, wait));
    });
    // Seed initial opp view
    setOpp({
      name: bot.name,
      avatar: bot.avatar,
      score: 0, progress: 0, submitted: false, isBot: true,
    });
    return () => { timers.forEach(clearTimeout); };
  }, [match?.is_bot_match, match?.bot_name, match?.bot_avatar_url, questions.length, waitForStart, startAt]);

  // Poll real opponent
  useEffect(() => {
    if (!match || !user || match.is_bot_match) return;
    let cancelled = false;
    const poll = async () => {
      const { data: players } = await supabase.from("battle_match_players")
        .select("user_id,score,submitted_at").eq("match_id", matchId);
      const oppRow = (players ?? []).find((p: any) => p.user_id !== user.id);
      if (!oppRow) return;
      const { data: profRows } = await (supabase as any).rpc("bg_get_opponent_profile", { _match_id: matchId });
      const prof = Array.isArray(profRows) ? profRows[0] : profRows;
      if (cancelled) return;
      const rawName = (prof as any)?.full_name?.trim();
      const email = (prof as any)?.email as string | undefined;
      const fallback = email ? email.split("@")[0] : `Player ${String(oppRow.user_id).slice(0, 4)}`;
      const displayName = rawName && rawName.length > 0 ? rawName : fallback;
      setOpp((prev) => {
        const newScore = Number(oppRow.score ?? 0);
        if (prev && newScore > prev.score) setPulseOpp((c) => c + 1);
        return {
          name: displayName,
          avatar: (prof as any)?.avatar_url ?? null,
          score: newScore,
          progress: Math.max(prev?.progress ?? 0, newScore),
          submitted: !!oppRow.submitted_at,
          isBot: false,
        };
      });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [match?.id, match?.is_bot_match, user?.id]);

  const current = questions[idx];
  const myScore = useMemo(
    () => questions.reduce((acc, q) => acc + (answers[q.id] === q.correct_index ? 1 : 0), 0),
    [answers, questions],
  );

  // Push live score on every pick so opponent's UI updates in real time.
  useEffect(() => {
    if (!match || submitted) return;
    if (match.is_bot_match) return;
    if (!Object.keys(answers).length) return;
    supabase.rpc("bg_update_player_score", { _match_id: matchId, _score: myScore }).catch((error: any) => {
      console.error("[battle] live score update failed", error, { matchId, myScore });
    });
  }, [myScore, match?.id, match?.is_bot_match, submitted]);


  // Pick an option: lock answer, reveal correctness, then auto-advance.
  // Wrapped in try/catch — defensive against any render-time crash that some
  // mobile browsers showed as "page didn't load, go back to home".
  function pickOption(qid: string, optionIdx: number) {
    try {
      if (submitted || revealed[qid] || answers[qid] !== undefined) return;
      const q = questions.find((qq) => qq.id === qid);
      if (!q) return;
      const now = Date.now();
      const last = lastAnswerAtRef.current;
      if (last != null && now - last < 1200) antiCheatRef.current.veryFastAnswers += 1;
      lastAnswerAtRef.current = now;
      setAnswers((a) => ({ ...a, [qid]: optionIdx }));
      setRevealed((r) => ({ ...r, [qid]: true }));
      if (optionIdx === q.correct_index) setPulseMe((c) => c + 1);
      setTimeout(() => {
        setIdx((i) => Math.min(i + 1, questions.length));
      }, REVEAL_MS);
    } catch (e) {
      console.error("[battle] pickOption failed", e);
      toast.error("Could not register your answer — try once more.");
    }
  }

  async function handleSubmit() {
    if (!match || submitting || submitted) return;
    if (submittingRef.current || submittedRef.current) return;
    // Set refs synchronously BEFORE any async work so the pagehide handler
    // and the auto-submit effect can't fire a second submit / a forfeit.
    submittingRef.current = true;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitted(true);
    try { localStorage.removeItem(storageKey(matchId)); } catch { /* noop */ }

    // Final score is verified server-side from answer ids + hash. Client score
    // is passed only as a fallback/diagnostic for old rows.
    const questionIds = questions.map((q) => q.id);
    const answerHash = stableHash({ matchId, questionIds, answers });
    const antiCheat = {
      ...antiCheatRef.current,
      startedAt: battleStartedAtRef.current,
      submittedAt: Date.now(),
      answerHash,
    };

    try {
      if (match.is_bot_match) {
        // Compute the bot's remaining time on its 12-18s/Q plan. We schedule
        // (not finalize) the bot submission so the result page can show a
        // real "Waiting for opponent" beat while the bot finishes its run.
        const plan = botPlanRef.current ?? planBotRun(questions.length);
        const totalBotMs = plan.reduce((sum, s) => sum + s.delayMs, 0);
        const startedAt = botStartRef.current ?? Date.now();
        const elapsed = Math.max(0, Date.now() - startedAt);
        const remaining = Math.max(0, totalBotMs - elapsed);
        await scheduleBot({
          data: {
            matchId,
            humanScore: myScore,
            botFinishInMs: remaining,
            answers,
            questionIds,
            antiCheat,
          },
        }).catch((e) => {
          console.error("[battle] scheduleBot failed", e);
        });
      } else {
        // Await the submit so the result page sees my submitted_at on its
        // very first poll. Otherwise the race causes a wrong "Submitting
        // both" screen instead of the correct "Waiting for opponent" view.
        await submitBattle({ data: { matchId, humanScore: myScore, answers, questionIds, antiCheat } })
          .catch((e: any) => {
            console.error("[battle] submit failed", e);
          });
      }
    } catch (e: any) {
      console.error("[battle] submit dispatch failed", e, { matchId, myScore });
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }

    // Now navigate. iSubmitted will be true on the result page's first read.
    nav({ to: "/battle/$matchId/result", params: { matchId } });
  }


  // Forfeit on unload — if the user closes the tab mid-match (after start,
  // before submission), surrender so the opponent isn't left hanging.
  useEffect(() => {
    if (!match || match.is_bot_match || submitted || waitForStart) return;
    const handler = () => {
      try {
        // Skip if the player already submitted (or is in the middle of submitting).
        // Otherwise pagehide can fire AFTER handleSubmit and forfeit a won match.
        if (submittedRef.current || submittingRef.current) return;
        // Best-effort RPC; the server also guards against forfeit-after-submit.
        supabase.rpc("bg_forfeit_match", { _match_id: matchId }).catch(() => {});
      } catch { /* noop */ }
    };
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [match?.id, match?.is_bot_match, submitted, waitForStart, matchId]);

  useEffect(() => {
    if (!questions.length) return;
    if (idx >= questions.length && !submittedRef.current && !submittingRef.current) handleSubmit();
  }, [idx, questions.length]);

  // Anti-cheat: block copy/paste/cut, context menu, text selection, dangerous
  // keyboard shortcuts (PrintScreen, Ctrl+C/V/X/S/P, F12, DevTools), drag,
  // and Picture-in-Picture. Detect active screen sharing via getDisplayMedia
  // permission and auto-submit when found. Lightweight — power users can still
  // bypass — but it eliminates the obvious cheating loop.
  useEffect(() => {
    if (!match || submitted || waitForStart) return;
    const block = (e: Event) => { antiCheatRef.current.blockedEvents += 1; e.preventDefault(); };
    const keyBlock = (e: KeyboardEvent) => {
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      // PrintScreen, Win+Shift+S helper, F12 / DevTools
      if (k === "PrintScreen" || (e.shiftKey && (k === "S" || k === "s") && e.metaKey) || k === "F12") {
        antiCheatRef.current.blockedEvents += 1;
        e.preventDefault();
        toast.error("Screenshots are disabled during a battle.");
        return;
      }
      // Block copy/paste/cut/save/print and devtools shortcut
      if (ctrl && ["c","C","v","V","x","X","s","S","p","P","u","U"].includes(k)) {
        antiCheatRef.current.blockedEvents += 1;
        e.preventDefault();
        toast.error("That shortcut is disabled during a battle.");
      }
      if (ctrl && e.shiftKey && ["I","i","J","j","C","c"].includes(k)) {
        antiCheatRef.current.blockedEvents += 1;
        e.preventDefault();
      }
    };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", keyBlock, true);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    // Screen-share / cast detection — when active, the page enters
    // "captured" mode and many browsers expose this via the media track.
    // We poll the permissions API; if display-capture is "granted" while
    // the battle is live, count it as cheating and auto-submit.
    let pollId: ReturnType<typeof setInterval> | null = null;
    const perms = (navigator as any).permissions;
    if (perms?.query) {
      pollId = setInterval(async () => {
        try {
          const status = await perms.query({ name: "display-capture" as any });
          if (status?.state === "granted" && !submittedRef.current && !submittingRef.current) {
            toast.error("Screen sharing detected — battle auto-submitted.");
            handleSubmit();
          }
        } catch { /* unsupported — ignore */ }
      }, 2500);
    }

    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", keyBlock, true);
      document.body.style.userSelect = prevUserSelect;
      if (pollId) clearInterval(pollId);
    };
  }, [match?.id, submitted, waitForStart]);


  // Anti-cheat: if the user leaves the tab / minimises / switches apps mid-match,
  // start a 10s grace timer. If they're not back by then, auto-submit with
  // whatever they have so far (suspected screenshot / lookup attempt).
  const [awaySecs, setAwaySecs] = useState<number | null>(null);
  useEffect(() => {
    if (!match || submitted || waitForStart) return;
    let deadline: number | null = null;
    let tickId: ReturnType<typeof setInterval> | null = null;
    const clear = () => {
      if (tickId) { clearInterval(tickId); tickId = null; }
      deadline = null;
      setAwaySecs(null);
    };
    const onHidden = () => {
      if (submittedRef.current || submittingRef.current) return;
      antiCheatRef.current.awayEvents += 1;
      deadline = Date.now() + AWAY_GRACE_MS;
      setAwaySecs(Math.ceil(AWAY_GRACE_MS / 1000));
      if (tickId) clearInterval(tickId);
      tickId = setInterval(() => {
        if (deadline == null) return;
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setAwaySecs(left);
        if (left <= 0) {
          clearInterval(tickId!);
          tickId = null;
          if (!submittedRef.current && !submittingRef.current) {
            toast.error("You left the battle screen — auto-submitted.");
            handleSubmit();
          }
        }
      }, 500);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") clear();
      else onHidden();
    };
    const onBlur = () => onHidden();
    const onFocus = () => clear();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    // Third-party overlay detector: Google Gemini / Assistant / split-screen
    // pop-ups shrink the viewport height by ~25-50% without firing blur on
    // some Android browsers. Treat any sudden >20% height drop as "away".
    const baseH = window.innerHeight;
    let lastH = baseH;
    const onResize = () => {
      const h = window.innerHeight;
      if (baseH > 0 && h < baseH * 0.78 && h < lastH - 40) {
        antiCheatRef.current.resizeEvents += 1;
        onHidden();
      }
      lastH = h;
    };
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("resize", onResize);
      clear();
    };
  }, [match?.id, submitted, waitForStart]);


  if (authLoading || !user || (!match && !err)) {
    return <LoadingScreen variant="battle" />;
  }
  if (err) {
    return (
      <PageShell><Card><CardContent className="p-6 text-center">
        <p className="text-sm text-destructive">{err}</p>
        <Button asChild variant="link"><Link to="/battlegrounds">Back to Battlegrounds</Link></Button>
      </CardContent></Card></PageShell>
    );
  }
  if (waitForStart) {
    const secs = Math.max(0, Math.ceil((startAt - Date.now()) / 1000));
    return (
      <>
        {!hasAckedAntiCheat("battle", matchId) && (
          <AntiCheatGate
            mode="battle"
            scopeId={matchId}
            onAccept={() => { /* gate dismisses itself; countdown keeps running */ }}
            onCancel={() => nav({ to: "/battlegrounds" })}
          />
        )}
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/95 via-accent/80 to-primary/90 text-primary-foreground">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur">
              <Swords className="h-3.5 w-3.5" /> Match starting
            </div>
            <div className="mt-6 text-8xl font-black tabular-nums tracking-tighter animate-scale-in">{secs}</div>
            <div className="mt-3 text-sm font-semibold uppercase tracking-wider opacity-90">Get ready</div>
          </div>
        </div>
      </>
    );
  }




  if (!current) {
    return <LoadingScreen variant="battle" />;
  }

  const isRevealed = !!revealed[current.id];
  const picked = answers[current.id];

  return (
    <PageShell>
      {/* Floating "+1" keyframes (scoped) */}
      <style>{`
        @keyframes floatPlus {
          0%   { transform: translate(-50%,0) scale(.6); opacity: 0; }
          20%  { transform: translate(-50%,-6px) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-44px) scale(1); opacity: 0; }
        }
        .float-plus { animation: floatPlus 1.2s ease-out forwards; }
      `}</style>

      {awaySecs !== null && (
        <div className="fixed inset-x-0 top-0 z-50 bg-rose-600 px-4 py-2 text-center text-xs font-bold text-white shadow-lg">
          You left the battle screen — auto-submitting in {awaySecs}s
        </div>
      )}


      {/* Live versus header */}
      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-border bg-background/80 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <PlayerChip
            name={profile?.full_name ?? "You"}
            avatar={avatarUrl(profile?.full_name ?? user?.id ?? "you", profile?.avatar_url ?? null)}
            badge={`${myScore} pts`}
            highlight
            pulseKey={pulseMe}
          />
          <div className="flex flex-col items-center">
            <div className={cn(
              "flex h-10 w-14 items-center justify-center rounded-lg font-mono text-base font-extrabold tabular-nums",
              secsLeft <= 5 ? "bg-rose-500 text-white animate-pulse" : "bg-secondary text-foreground",
            )}>{secsLeft}</div>
            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Q {Math.min(idx + 1, questions.length)}/{questions.length}
            </div>
          </div>
          <PlayerChip
            name={opp?.name ?? "Opponent"}
            avatar={avatarUrl(opp?.name ?? "opp", opp?.avatar ?? null)}
            badge={`${opp?.score ?? 0} pts`}
            isBot={opp?.isBot}
            rightAlign
            pulseKey={pulseOpp}
          />
        </div>
      </div>

      {/* Question card */}
      <Card className="border-0 shadow-soft">
        <CardContent className="p-5 sm:p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Question {idx + 1} of {questions.length}
          </div>
          <div className="mt-2 text-base font-semibold leading-relaxed">
            <RichText>{current.text}</RichText>
          </div>

          <div className="mt-5 grid gap-2.5">
            {current.options.map((opt, i) => {
              const isPicked = picked === i;
              const isCorrect = current.correct_index === i;
              const showCorrect = isRevealed && isCorrect;
              const showWrong = isRevealed && isPicked && !isCorrect;
              return (
                <button
                  key={i}
                  onClick={() => pickOption(current.id, i)}
                  disabled={isRevealed}
                  className={cn(
                    "group rounded-2xl border p-3.5 text-left transition-all",
                    !isRevealed && isPicked && "border-primary bg-primary/10 shadow-sm",
                    !isRevealed && !isPicked && "border-border bg-card hover:border-primary/40 hover:bg-accent/20",
                    showCorrect && "border-emerald-500 bg-emerald-500/10",
                    showWrong && "border-rose-500 bg-rose-500/10",
                    isRevealed && !showCorrect && !showWrong && "border-border bg-card opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      showCorrect && "border-emerald-500 bg-emerald-500 text-white",
                      showWrong && "border-rose-500 bg-rose-500 text-white",
                      !isRevealed && isPicked && "border-primary bg-primary text-primary-foreground",
                      !isRevealed && !isPicked && "border-border bg-secondary text-muted-foreground",
                    )}>
                      {showCorrect ? <Check className="h-4 w-4" /> :
                       showWrong   ? <X className="h-4 w-4" /> :
                       isPicked    ? <Check className="h-4 w-4" /> :
                       String.fromCharCode(65 + i)}
                    </div>
                    <div className="text-sm leading-relaxed"><RichText>{opt}</RichText></div>
                  </div>
                </button>
              );
            })}
          </div>

          {isRevealed && (
            <div className={cn(
              "mt-4 rounded-xl px-3 py-2 text-center text-xs font-bold",
              picked === current.correct_index
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-rose-500/10 text-rose-600",
            )}>
              {picked === undefined
                ? "Time's up — moving on…"
                : picked === current.correct_index
                ? "Correct! +1 point"
                : "Not quite — correct answer highlighted"}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-3 text-center text-[11px] text-muted-foreground">
        <Clock className="-mt-0.5 mr-1 inline h-3 w-3" />
        Answers lock instantly. Tie? Both stakes refund.
      </div>
    </PageShell>
  );
}

function PlayerChip({
  name, avatar, badge, highlight, rightAlign, isBot, pulseKey,
}: {
  name: string; avatar: string | null; badge: string;
  highlight?: boolean; rightAlign?: boolean; isBot?: boolean; pulseKey?: number;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", rightAlign && "flex-row-reverse text-right")}>
      <div className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2",
        highlight ? "border-primary" : "border-border",
      )}>
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold">{name.slice(0, 1).toUpperCase()}</span>
        )}
        {/* bot identity hidden — opponent feels human */}
        {isBot ? null : null}
        {pulseKey ? (
          <span
            key={pulseKey}
            className="float-plus pointer-events-none absolute left-1/2 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-md"
          >+1</span>
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-bold">{name}</div>
        <div className="text-[10px] font-semibold text-muted-foreground">{badge}</div>
      </div>
    </div>
  );
}
