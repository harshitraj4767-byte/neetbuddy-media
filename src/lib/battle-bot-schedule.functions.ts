// Schedules a bot match: records the human's submission and writes
// `bot_submitted_at` to a FUTURE timestamp so the result page can show a
// real "Waiting for opponent" beat while the bot finishes its 12-18s/question
// run. Finalization (prize crediting) is still handled by `finalizeBotMatch`,
// which is called from the result page after `bot_submitted_at` has passed.
//
// All writes go through the service-role admin client. Idempotent.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function questionCountForStake(stake: number) {
  return stake >= 10 ? 10 : 5;
}

function botWinProbability(stake: number) {
  if (stake >= 25) return 0.85;
  if (stake >= 10) return 0.78;
  if (stake >= 5) return 0.72;
  if (stake >= 2) return 0.62;
  return 0.30;
}

function pickSmallMargin(): number {
  const r = Math.random();
  if (r < 0.70) return 1;
  if (r < 0.92) return 2;
  return 3;
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

type SubmitPayload = {
  matchId: string;
  humanScore?: number;
  plannedBotScore?: number;
  botFinishInMs?: number;
  answers?: Record<string, number>;
  questionIds?: string[];
  antiCheat?: {
    startedAt?: number;
    submittedAt?: number;
    awayEvents?: number;
    blockedEvents?: number;
    resizeEvents?: number;
    veryFastAnswers?: number;
    answerHash?: string;
  };
};

async function verifyHumanScore(admin: { from: (t: string) => any }, data: SubmitPayload, stake: number) {
  const maxQuestions = questionCountForStake(stake);
  const questionIds = (data.questionIds ?? []).slice(0, maxQuestions).filter(Boolean);
  const answers = data.answers ?? {};
  if (!questionIds.length) return { score: 0, maxQuestions, suspicious: true, expectedHash: "missing" };

  const expectedHash = stableHash({ matchId: data.matchId, questionIds, answers });
  const hashOk = data.antiCheat?.answerHash === expectedHash;

  const { data: rows, error } = await admin
    .from("questions")
    .select("id,correct_index")
    .in("id", questionIds);
  if (error) throw new Error(error.message);
  const correct = new Map((rows ?? []).map((q: any) => [String(q.id), Number(q.correct_index)]));
  let score = 0;
  for (const qid of questionIds) {
    if (answers[qid] === correct.get(qid)) score++;
  }

  const suspicious = !hashOk ||
    Number(data.antiCheat?.awayEvents ?? 0) >= 2 ||
    Number(data.antiCheat?.blockedEvents ?? 0) >= 3 ||
    Number(data.antiCheat?.resizeEvents ?? 0) >= 2 ||
    Number(data.antiCheat?.veryFastAnswers ?? 0) >= 3;
  return { score, maxQuestions, suspicious, expectedHash };
}

function planServerBotScore(humanScore: number, maxQuestions: number, stake: number, suspicious: boolean) {
  const margin = pickSmallMargin();
  const shouldBotWin = suspicious || Math.random() < botWinProbability(stake);
  if (shouldBotWin) {
    if (humanScore >= maxQuestions) return maxQuestions;
    return Math.min(maxQuestions, humanScore + margin);
  }
  if (stake > 0 && Math.random() < 0.035) return humanScore;
  return Math.max(0, humanScore - margin);
}

export const scheduleBotMatchSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        matchId: z.string().uuid(),
        humanScore: z.number().int().min(0).max(50).optional(),
        plannedBotScore: z.number().int().min(0).max(50).optional(),
        botFinishInMs: z.number().int().min(0).max(10 * 60_000).default(0),
        answers: z.record(z.string(), z.number().int().min(0).max(20)).optional(),
        questionIds: z.array(z.string().uuid()).max(20).optional(),
        antiCheat: z.object({
          startedAt: z.number().optional(),
          submittedAt: z.number().optional(),
          awayEvents: z.number().int().min(0).max(100).optional(),
          blockedEvents: z.number().int().min(0).max(100).optional(),
          resizeEvents: z.number().int().min(0).max(100).optional(),
          veryFastAnswers: z.number().int().min(0).max(100).optional(),
          answerHash: z.string().max(64).optional(),
        }).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const userId = context.userId;

    // Verify the caller is in this match (admin client bypasses RLS).
    const { data: meRow } = await admin
      .from("battle_match_players")
      .select("user_id,score,submitted_at")
      .eq("match_id", data.matchId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!meRow) return { ok: false, reason: "forbidden" as const };

    const { data: match } = await admin
      .from("battle_matches")
      .select("id,status,is_bot_match,bot_submitted_at,bot_score,stake")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) return { ok: false, reason: "not_found" as const };
    if (!match.is_bot_match) return { ok: false, reason: "not_bot_match" as const };

    const stake = Number(match.stake ?? 0);
    const verified = await verifyHumanScore(admin, data, stake);
    const verifiedScore = typeof verified === "number" ? verified : verified.score;
    const maxQuestions = typeof verified === "number" ? questionCountForStake(stake) : verified.maxQuestions;
    const suspicious = typeof verified === "number" ? false : verified.suspicious;
    const finalBotScore = planServerBotScore(verifiedScore, maxQuestions, stake, suspicious);

    // 1) Record human submission once. Score is verified server-side from answers when provided.
    if (meRow.submitted_at == null) {
      await admin
        .from("battle_match_players")
        .update({ score: verifiedScore, submitted_at: new Date().toISOString() })
        .eq("match_id", data.matchId)
        .eq("user_id", userId);
    }

    // 2) Schedule bot submission for the future (only set once).
    if (match.bot_submitted_at == null && match.status !== "finished") {
      const botFinishAt = new Date(Date.now() + Math.max(0, data.botFinishInMs)).toISOString();
      await admin
        .from("battle_matches")
        .update({
          bot_submitted_at: botFinishAt,
          bot_score: finalBotScore,
        })
        .eq("id", data.matchId)
        .is("bot_submitted_at", null);
    }

    return { ok: true, score: verifiedScore, botScore: finalBotScore, suspicious };
  });

export const submitBattleAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      matchId: z.string().uuid(),
      humanScore: z.number().int().min(0).max(50).optional(),
      answers: z.record(z.string(), z.number().int().min(0).max(20)).optional(),
      questionIds: z.array(z.string().uuid()).max(20).optional(),
      antiCheat: z.object({
        startedAt: z.number().optional(),
        submittedAt: z.number().optional(),
        awayEvents: z.number().int().min(0).max(100).optional(),
        blockedEvents: z.number().int().min(0).max(100).optional(),
        resizeEvents: z.number().int().min(0).max(100).optional(),
        veryFastAnswers: z.number().int().min(0).max(100).optional(),
        answerHash: z.string().max(64).optional(),
      }).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: match, error } = await admin
      .from("battle_matches")
      .select("id,stake,is_bot_match")
      .eq("id", data.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match) return { ok: false, reason: "not_found" as const };
    if (match.is_bot_match) return { ok: false, reason: "bot_match" as const };
    const verified = await verifyHumanScore(admin, data, Number(match.stake ?? 0));
    const score = typeof verified === "number" ? verified : verified.score;
    const { data: out, error: submitErr } = await (context.supabase as any).rpc("bg_submit_match_score", {
      _match_id: data.matchId,
      _score: score,
    });
    if (submitErr) throw new Error(submitErr.message);
    return { ok: true, score, result: out, suspicious: typeof verified === "number" ? false : verified.suspicious };
  });
