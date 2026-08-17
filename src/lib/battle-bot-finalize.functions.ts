// Bot-match finalizer that works on the existing `battle_matches` /
// `battle_match_players` / `profiles` / `wallet_transactions` schema, without
// requiring any new database function. Used when the legacy
// `bg_finalize_bot_match` RPC is missing or returns a non-finished status
// (the cause of the "stuck on Waiting for opponent" screen in bot battles).
//
// All writes go through the service-role admin client. The function is
// idempotent: if the match is already `finished`, it returns the existing
// outcome and never double-credits the prize.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { avatarForName, isNeetiqAvatar } from "@/lib/neetiq-avatars";

type FinalizeResult =
  | { status: "finished"; outcome: "win" | "loss" | "tie"; prize: number; winnerUserId: string | null; humanScore: number; botScore: number }
  | { status: "waiting_self" }
  | { status: "not_found" }
  | { status: "not_bot_match" }
  | { status: "forbidden" };

const BOT_NAMES = ["Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova", "Tara Flux"];
function botNameForMatch(matchId: string, preferred?: string | null) {
  const clean = preferred?.trim();
  if (clean && !["opponent", "bot opponent"].includes(clean.toLowerCase())) return clean;
  const n = Array.from(matchId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return BOT_NAMES[n % BOT_NAMES.length];
}

// Deterministic bot score from match id — used as a fallback when no
// reliable client-side score is available (page refresh, mid-match retry).
// Range 2..4 out of 5 (~40-80% accuracy) so wins/losses feel varied.
function deterministicBotScore(matchId: string): number {
  let hash = 0;
  for (let i = 0; i < matchId.length; i++) {
    hash = (hash * 31 + matchId.charCodeAt(i)) | 0;
  }
  return 2 + (Math.abs(hash) % 3); // 2, 3, or 4
}

function questionCountForStake(stake: number) {
  return stake >= 10 ? 10 : 5;
}

export const finalizeBotMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        matchId: z.string().uuid(),
        humanScore: z.number().int().min(0).max(50).optional(),
        botScore: z.number().int().min(0).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FinalizeResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    };
    const userId = context.userId;

    // 1. Load match (admin client bypasses RLS)
    const { data: match, error: mErr } = await admin
      .from("battle_matches")
      .select(
        "id,stake,status,winner_user_id,prize_amount,is_bot_match,bot_name,bot_avatar_url,bot_score,bot_submitted_at,countdown_starts_at,started_at",
      )
      .eq("id", data.matchId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!match) return { status: "not_found" };
    if (!match.is_bot_match) return { status: "not_bot_match" };

    // 2. Verify the caller is the human player in this match
    const { data: meRow } = await admin
      .from("battle_match_players")
      .select("user_id,score,submitted_at")
      .eq("match_id", data.matchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!meRow) return { status: "forbidden" };

    const botName = botNameForMatch(data.matchId, match.bot_name);
    const botAvatarUrl =
      typeof match.bot_avatar_url === "string" && isNeetiqAvatar(match.bot_avatar_url)
        ? match.bot_avatar_url
        : avatarForName(botName);

    // Human score is sticky: prefer DB row, fall back to caller-provided.
    const humanScore = Number(
      meRow.score != null && meRow.score > 0
        ? meRow.score
        : (data.humanScore ?? 0),
    );

    // Idempotent: if already finished, just report the locked-in outcome.
    if (match.status === "finished") {
      const winnerUserId: string | null = match.winner_user_id ?? null;
      const lockedBot = Number(match.bot_score ?? 0);
      const outcome: "win" | "loss" | "tie" =
        winnerUserId === userId
          ? "win"
          : winnerUserId == null && Number(meRow.score ?? humanScore) === lockedBot && Number(match.stake ?? 0) <= 0
            ? "tie"
            : "loss";
      return {
        status: "finished",
        outcome,
        prize: Number(match.prize_amount ?? 0),
        winnerUserId,
        humanScore: Number(meRow.score ?? humanScore),
        botScore: lockedBot,
      };
    }

    // Caller hasn't submitted yet AND didn't pass a score — don't finalize.
    if (meRow.submitted_at == null && (data.humanScore == null || data.humanScore < 0)) {
      return { status: "waiting_self" };
    }

    const stake = Number(match.stake ?? 0);

    // 3. Lock in the human's submission row (score + submitted_at)
    if (meRow.submitted_at == null) {
      await admin
        .from("battle_match_players")
        .update({ score: humanScore, submitted_at: new Date().toISOString() })
        .eq("match_id", data.matchId)
        .eq("user_id", userId);
    }

    // 4. SERVER-AUTHORITATIVE bot outcome by stake tier.
    //    Bot WIN targets: free 25%, low (₹2-5) 50%, high (₹10+) 66%.
    //    Tie rate is small (~5% on free, ~3% otherwise) so the configured
    //    bot-win % is preserved. We compute decision inline (no RPC) so
    //    a transient RPC failure can never collapse to a user-favored default.
    const tier: "free" | "low" | "high" = stake <= 0 ? "free" : stake < 10 ? "low" : "high";
    const BOT_WIN_TARGET = tier === "free" ? 0.25 : tier === "low" ? 0.50 : 0.66;
    const TIE_RATE = tier === "free" ? 0.05 : 0.03;
    const roll = Math.random();
    let decided: "bot_win" | "bot_loss" | "tie";
    if (roll < TIE_RATE) decided = "tie";
    else if (roll < TIE_RATE + BOT_WIN_TARGET) decided = "bot_win";
    else decided = "bot_loss";

    const MAX = questionCountForStake(stake);
    function pickMargin(): number {
      const r = Math.random();
      if (r < 0.65) return 1;
      if (r < 0.90) return 2;
      return 3;
    }
    let botScore: number;
    if (match.bot_score != null) {
      botScore = Math.max(0, Math.min(MAX, Number(match.bot_score)));
      decided = botScore > humanScore ? "bot_win" : botScore < humanScore ? "bot_loss" : stake > 0 ? "bot_win" : "tie";
    } else if (decided === "bot_win") {
      if (humanScore >= MAX) { botScore = MAX; decided = stake > 0 ? "bot_win" : "tie"; }
      else botScore = Math.min(MAX, humanScore + pickMargin());
    } else if (decided === "tie") {
      botScore = humanScore;
    } else {
      if (humanScore === 0) { botScore = 0; decided = "tie"; }
      else botScore = Math.max(0, humanScore - pickMargin());
    }

    // Best-effort daily counter (for analytics; no longer drives decisions).
    try { void admin.rpc("bg_record_bot_outcome", { _tier: tier, _outcome: decided }); } catch { /* noop */ }
    void deterministicBotScore;

    // 5. Outcome → winner / prize.
    const winnerUserId = decided === "bot_loss" ? userId : null;
    const isTie = decided === "tie";
    const isWin = decided === "bot_loss";
    const prize = isWin && stake > 0 ? Math.round(stake * 2 * 0.85 * 100) / 100 : 0;


    // 5. Atomically finalize the match. Some live bot matches are stored with
    //    non-`active` statuses by older DB functions, so only guard against an
    //    already-finished row. The DB evaluates this filter at update time,
    //    preventing double prize/refund credit during concurrent retries.
    const { data: updated, error: uErr } = await admin
      .from("battle_matches")
      .update({
        status: "finished",
        winner_user_id: winnerUserId,
        prize_amount: prize,
        bot_name: botName,
        bot_avatar_url: botAvatarUrl,
        bot_score: botScore,
        bot_submitted_at: match.bot_submitted_at ?? new Date().toISOString(),
        ends_at: new Date().toISOString(),
      })
      .eq("id", data.matchId)
      .neq("status", "finished")
      .select("id,winner_user_id,prize_amount")
      .maybeSingle();
    if (uErr) throw new Error(uErr.message);

    if (!updated) {
      // Lost the race — somebody else finalized first. Re-read and return.
      const { data: m2 } = await admin
        .from("battle_matches")
        .select("winner_user_id,prize_amount,bot_score")
        .eq("id", data.matchId)
        .maybeSingle();
      const wId: string | null = m2?.winner_user_id ?? null;
      const finalBotScore2 = Number(m2?.bot_score ?? botScore);
      const outcome: "win" | "loss" | "tie" =
        wId === userId
          ? "win"
          : wId == null && humanScore === finalBotScore2 && stake <= 0
            ? "tie"
            : "loss";
      return {
        status: "finished",
        outcome,
        prize: Number(m2?.prize_amount ?? 0),
        winnerUserId: wId,
        humanScore,
        botScore: Number(m2?.bot_score ?? botScore),
      };
    }

    // 6. XP reward. Money system removed: win = +10 XP, lose/tie = 0 (no XP loss).
    //    Legacy stake > 0 credits are intentionally dropped — the client always
    //    joins with stake=0 now, so wallet_transactions won't be touched.
    if (isWin) {
      const { data: prof } = await admin
        .from("profiles")
        .select("xp_total")
        .eq("id", userId)
        .maybeSingle();
      const nextXp = Number((prof as { xp_total?: number } | null)?.xp_total ?? 0) + 10;
      await admin.from("profiles").update({ xp_total: nextXp }).eq("id", userId);
    }

    return {
      status: "finished",
      outcome: isWin ? "win" : isTie ? "tie" : "loss",
      prize,
      winnerUserId,
      humanScore,
      botScore,
    };
  });
