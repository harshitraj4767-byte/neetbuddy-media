import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";
import { getSettingNumber } from "@/lib/app-settings.functions";
import { isAdminUser } from "@/lib/admin-bypass.server";
import { NEET_HISTORY, neetHistoryPromptBlock } from "@/lib/neet-history";

async function chargeBonus(userId: string, cost: number, type: string, reference: string) {
  // Admins bypass all bonus charges (infinite bonus).
  if (await isAdminUser(userId)) return Number.POSITIVE_INFINITY;
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id,bonus_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = Number(profile?.bonus_balance ?? 0);
  if (current < cost) {
    throw new Error(`Not enough bonus. You need ${cost} bonus coins (you have ${current}). Earn more from the Bonus page.`);
  }
  const next = current - cost;
  const { error: uErr } = await supabaseAdmin
    .from("profiles")
    .update({ bonus_balance: next })
    .eq("id", userId);
  if (uErr) throw new Error(uErr.message);
  await supabaseAdmin.from("wallet_transactions").insert({
    user_id: userId, amount: -cost, type, bucket: "bonus", status: "success", reference,
  });
  return next;
}

type SubjectStat = { subject: string; attempted: number; correct: number; accuracy: number; avg_time_sec: number };

async function gatherUserStats(userId: string) {
  const { data: attempts } = await supabaseAdmin
    .from("attempts")
    .select("id,score,correct_count,wrong_count,unattempted_count,submitted_at,test_id,answers,tests:test_id(type,total_questions,difficulty)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("submitted_at", { ascending: false })
    .limit(60);

  const list = (attempts ?? []) as any[];

  // Rebuild per-question stats from attempts.answers (JSONB). The normalized
  // attempt_answers table exists but is not yet populated by the quiz submit
  // path; the JSONB on attempts is the source of truth today.
  const qIds = new Set<string>();
  for (const a of list) {
    const ans = (a?.answers ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(ans)) qIds.add(k);
  }
  const qArr = Array.from(qIds).slice(0, 5000);
  const { data: qs } = qArr.length
    ? await supabaseAdmin
        .from("questions")
        .select("id,correct_index,difficulty,subjects:subject_id(name),chapters:chapter_id(name)")
        .in("id", qArr)
    : { data: [] as any[] };
  const qMap = new Map<string, any>();
  for (const q of (qs ?? []) as any[]) qMap.set(q.id, q);

  const subjBuckets = new Map<string, { c: number; t: number; timeMs: number }>();
  const chapBuckets = new Map<string, { subject: string; c: number; t: number }>();
  const diffBuckets = new Map<string, { c: number; t: number }>();
  for (const a of list) {
    const ans = (a?.answers ?? {}) as Record<string, number>;
    for (const [qid, sel] of Object.entries(ans)) {
      const q = qMap.get(qid);
      if (!q) continue;
      const subj = q?.subjects?.name ?? "General";
      const chap = q?.chapters?.name ?? "General";
      const diff = q?.difficulty ?? "medium";
      const is_correct = Number(sel) === Number(q.correct_index);
      const s = subjBuckets.get(subj) ?? { c: 0, t: 0, timeMs: 0 };
      s.t++; if (is_correct) s.c++;
      subjBuckets.set(subj, s);
      const chapKey = `${subj}::${chap}`;
      const cb = chapBuckets.get(chapKey) ?? { subject: subj, c: 0, t: 0 };
      cb.t++; if (is_correct) cb.c++;
      chapBuckets.set(chapKey, cb);
      const db = diffBuckets.get(diff) ?? { c: 0, t: 0 };
      db.t++; if (is_correct) db.c++;
      diffBuckets.set(diff, db);
    }
  }

  const subjectStats: SubjectStat[] = Array.from(subjBuckets.entries()).map(([subject, v]) => ({
    subject, attempted: v.t, correct: v.c,
    accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0,
    avg_time_sec: v.t ? Math.round(v.timeMs / v.t / 1000) : 0,
  }));
  const weakChapters = Array.from(chapBuckets.entries())
    .map(([k, v]) => ({ subject: v.subject, chapter: k.split("::")[1], attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0 }))
    .filter((r) => r.attempted >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);
  const strongChapters = Array.from(chapBuckets.entries())
    .map(([k, v]) => ({ subject: v.subject, chapter: k.split("::")[1], attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0 }))
    .filter((r) => r.attempted >= 3)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 10);
  const byDifficulty = Array.from(diffBuckets.entries()).map(([difficulty, v]) => ({
    difficulty, attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0,
  }));

  const totalScore = list.reduce((s, a) => s + Number(a.score ?? 0), 0);
  const totalQs = list.reduce((s, a) => s + Number(a.tests?.total_questions ?? 0), 0);
  // Weighted trend: newer attempts weight more.
  const recent = list.slice(0, 15);
  let wSum = 0, wDen = 0;
  recent.forEach((a, i) => {
    const max = Number(a.tests?.total_questions ?? 0) * 4;
    if (!max) return;
    const pct = Number(a.score ?? 0) / max;
    const w = recent.length - i;
    wSum += pct * w; wDen += w;
  });
  const weightedAvgPct = wDen ? Math.round((wSum / wDen) * 100) : 0;

  // Very rough baseline projection: scale current accuracy to 720 with a
  // difficulty factor from the last NEET year's toughness.
  const lastYear = NEET_HISTORY[NEET_HISTORY.length - 1];
  const toughnessFactor: Record<string, number> = { easy: 1.05, moderate: 1.0, tough: 0.92, very_tough: 0.88 };
  const baselineProjection = Math.max(
    0,
    Math.min(720, Math.round(720 * (weightedAvgPct / 100) * (toughnessFactor[lastYear.toughness] ?? 0.95))),
  );

  return {
    attempts: list.length,
    avgScorePct: totalQs ? Math.round((totalScore / (totalQs * 4)) * 100) : 0,
    weightedAvgPct,
    baselineProjection,
    subjectStats,
    weak_chapters: weakChapters,
    strong_chapters: strongChapters,
    by_difficulty: byDifficulty,
    recent: recent.slice(0, 10).map((a) => ({
      score: Number(a.score ?? 0),
      correct: Number(a.correct_count ?? 0),
      wrong: Number(a.wrong_count ?? 0),
      unattempted: Number(a.unattempted_count ?? 0),
      test_difficulty: a.tests?.difficulty ?? "mix",
      type: a.tests?.type ?? "quiz",
      max: Number(a.tests?.total_questions ?? 0) * 4,
    })),
  };
}

export const getLatestPrediction = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("score_predictions" as never)
      .select("id,predicted_marks,predicted_air_band,payload,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { latest: data ?? null };
  });

const PREDICTOR_COOLDOWN_MS = 48 * 60 * 60 * 1000;

export const runScorePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 0) 48-hour throttle (checked BEFORE charging).
    const { data: prevRow } = await supabaseAdmin
      .from("score_predictions" as never)
      .select("created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevRow) {
      const prevMs = new Date((prevRow as any).created_at).getTime();
      const elapsed = Date.now() - prevMs;
      if (elapsed < PREDICTOR_COOLDOWN_MS && !(await isAdminUser(context.userId))) {
        const nextAt = new Date(prevMs + PREDICTOR_COOLDOWN_MS);
        throw new Error(`Score predictor is available once every 48 hours. Try again after ${nextAt.toLocaleString()}.`);
      }
    }

    const cost = await getSettingNumber("score_predictor_cost", 25);
    // 1) Gather stats first so we can surface error before charging
    const stats = await gatherUserStats(context.userId);
    if (stats.attempts < 1) {
      throw new Error("Take at least one test before using the Score Predictor.");
    }
    // 2) Charge
    const reference = `predict_${Date.now()}`;
    await chargeBonus(context.userId, cost, "score_predict", reference);

    // 3) Call AI
    const sys = `You are an expert NEET-UG examiner and data analyst. Predict this student's NEET-UG score out of 720 with high precision.

METHOD (follow strictly):
1. Anchor: start from the provided \`baselineProjection\` (a weighted, difficulty-adjusted projection from recent attempts).
2. Adjust for consistency: penalize high variance in \`recent\` scores; reward improving trend (later attempts weighted more).
3. Adjust for difficulty coverage: strong accuracy on "hard" difficulty is a strong positive signal; weak "easy" accuracy is a strong negative signal.
4. Subject breakdown: Physics max 180, Chemistry max 180, Biology max 360. Use \`subjectStats\` accuracy and average time; slow + inaccurate => cut marks aggressively. Biology weight is highest for total.
5. Map predicted_marks to predicted_air_band using the NEET history rank ladder below. Interpolate between the two nearest ladder points and blend across the last 3 years (weight recent years more). Provide the band as a range like "AIR 3,000 - 5,500".
6. Confidence: pick "low" if attempts < 5, "medium" if 5-15, "high" if > 15 with low variance.
7. Strengths/weaknesses must reference actual chapters from \`weak_chapters\`/\`strong_chapters\`.
8. Advice: 4-6 specific items with concrete numbers (e.g. "Solve 30 PYQs on Mechanics daily for the next 2 weeks; target 80% accuracy").
Be honest — do not inflate scores. Output via tool call only.

${neetHistoryPromptBlock()}`;
    const userMsg = `Student stats JSON:\n${JSON.stringify(stats, null, 2)}`;
    let res: Response;
    try {
      res = await callAiGatewayWithRotation("/v1/chat/completions", {
        model: "google/gemini-2.5-pro",
        temperature: 0.2,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        tools: [{
          type: "function",
          function: {
            name: "emit_prediction",
            parameters: {
              type: "object",
              properties: {
                predicted_marks: { type: "integer" },
                predicted_air_band: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                subject_breakdown: {
                  type: "array",
                  items: { type: "object", properties: {
                    subject: { type: "string" }, predicted_marks: { type: "integer" }, max_marks: { type: "integer" },
                  }, required: ["subject", "predicted_marks", "max_marks"], additionalProperties: false },
                },
                strengths: { type: "array", items: { type: "string" } },
                weaknesses: { type: "array", items: { type: "string" } },
                advice: { type: "array", items: { type: "string" } },
              },
              required: ["predicted_marks", "predicted_air_band", "confidence", "subject_breakdown", "strengths", "weaknesses", "advice"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "emit_prediction" } },
      });
    } catch (e: any) {
      // Refund on AI failure
      await supabaseAdmin.from("profiles").update({
        bonus_balance: (await supabaseAdmin.from("profiles").select("bonus_balance").eq("id", context.userId).maybeSingle()).data?.bonus_balance as any + cost,
      }).eq("id", context.userId);
      throw e;
    }
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no prediction");
    const payload = JSON.parse(args);

    const { data: inserted, error } = await supabaseAdmin
      .from("score_predictions" as never)
      .insert({
        user_id: context.userId,
        predicted_marks: Math.max(0, Math.min(720, Number(payload.predicted_marks ?? 0))),
        predicted_air_band: String(payload.predicted_air_band ?? "—"),
        payload,
      } as never)
      .select("id,predicted_marks,predicted_air_band,payload,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { prediction: inserted, charged: cost };
  });
