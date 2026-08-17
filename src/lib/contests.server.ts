// Server-only implementation for the Daily Live Quiz / contest flow.
// `contests.functions.ts` must stay a thin server-function wrapper (the
// server-fn splitter strips module-scope runtime siblings), so ALL runtime
// helpers, constants and handler bodies live here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActiveAiKey } from "@/lib/ai-keys.functions";
import type { SupabaseClient } from "@supabase/supabase-js";


type QType =
  | "numerical" | "assertion-reason" | "statement-based" | "match-the-following"
  | "ranking" | "graphical" | "diagram-based" | "case-based" | "fill-in-the-blanks"
  | "incorrect-statement" | "reaction-sequence" | "concept-mcq";

type GenQ = {
  type: QType;
  text: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topic?: string;
  sub_topic?: string;
};

// Prize weights for ranks 1..10. Normalised across the actual number of joiners (capped at 10).
export const PRIZE_WEIGHTS = [30, 20, 12, 10, 8, 6, 5, 4, 3, 2] as const;

/** Pool = entry_fee × joiners. Split among top-min(joiners,10) by normalised weights. */
export function computePrizeSplit(pool: number, joiners: number): number[] {
  const winners = Math.min(Math.max(0, Math.floor(joiners)), 10);
  if (winners <= 0 || pool <= 0) return [];
  const weights = PRIZE_WEIGHTS.slice(0, winners);
  const sum = weights.reduce((a, b) => a + b, 0);
  // Round each to 2 decimals; push any rounding remainder onto rank 1.
  const raw = weights.map((w) => Math.round(((pool * w) / sum) * 100) / 100);
  const distributed = raw.reduce((a, b) => a + b, 0);
  const remainder = Math.round((pool - distributed) * 100) / 100;
  if (raw.length > 0) raw[0] = Math.round((raw[0] + remainder) * 100) / 100;
  return raw;
}



const NEET_MASTER_SYSTEM = `You are an elite NEET-UG / IIT-JEE question setter. Generate high-yield, exam-standard, unique MCQs from the rationalized NCERT syllabus (Classes 11 & 12).

LATEX: Wrap every variable, unit, formula, ratio in LaTeX. Inline $...$, display $$...$$. Single backslash inside JSON strings. Never break \`$\` delimiters.

QUESTION-TYPE MIX (vary across the batch — never all the same type):
- numerical, assertion-reason, statement-based, ranking, graphical, diagram-based, case-based, fill-in-the-blanks, incorrect-statement, reaction-sequence, concept-mcq
- match-the-following: MUST use a LaTeX array table — NOT a markdown pipe table. Exact template:
\`Match the following ...:\\n\\n$$\\n\\\\begin{array}{|c|c|}\\n\\\\hline\\n\\\\textbf{Column I} & \\\\textbf{Column II} \\\\\\\\\\n\\\\hline\\nA.\\\\ \\\\text{...} & i.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nB.\\\\ \\\\text{...} & ii.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nC.\\\\ \\\\text{...} & iii.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\nD.\\\\ \\\\text{...} & iv.\\\\ \\\\text{...} \\\\\\\\\\n\\\\hline\\n\\\\end{array}\\n$$\\n\\nSelect the correct matching sequence:\`
  Options like "A-iii, B-i, C-ii, D-iv".
- diagram-based: describe a labelled diagram in words/LaTeX with labels (P), (Q), (R), (S) and ask to identify a part. No images.
- assertion-reason 4 options: (A) Both true + R explains A. (B) Both true but R does NOT explain A. (C) A true, R false. (D) A false, R true. Text: \`**Assertion (A):** ...\\n\\n**Reason (R):** ...\`

QUALITY: Zero redundancy. All 4 distractors plausible. Exactly one correct option. Mix Easy/Medium/Hard. Spread correct option across A/B/C/D.

EXPLANATION — SHORT & CLEAR (4–8 lines max). Understanding > length. No long derivations, no 4-section template.
- One line key concept / NCERT fact
- 1–3 lines core reasoning or calculation (LaTeX)
- One line ruling out closest distractor
- End with \`**Answer: Option X.**\``;

async function generateContestQuestions(
  chapters: { name: string; subject: string }[],
  count: number,
): Promise<GenQ[]> {
  const apiKey = await getActiveAiKey();
  const chapterList = chapters.map((c) => `- ${c.subject} / ${c.name}`).join("\n");
  const user = `Produce ${count} unique NEET-grade MCQs distributed across these chapters:\n${chapterList}\nUse a VARIED mix of question types. Each MCQ has 4 distinct options and one correct index (0-3).`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: NEET_MASTER_SYSTEM }, { role: "user", content: user }],
      tools: [{ type: "function", function: { name: "emit_questions", parameters: {
        type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
          type: { type: "string", enum: [
            "numerical","assertion-reason","statement-based","match-the-following",
            "ranking","graphical","diagram-based","case-based","fill-in-the-blanks",
            "incorrect-statement","reaction-sequence","concept-mcq",
          ] },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
          correct_index: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["Easy","Medium","Hard"] },
          topic: { type: "string" },
          sub_topic: { type: "string" },
        }, required: ["type","text","options","correct_index","explanation","difficulty","topic","sub_topic"], additionalProperties: false } } },
        required: ["questions"], additionalProperties: false,
      }}}],
      tool_choice: { type: "function", function: { name: "emit_questions" } },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI did not return tool call");
  const parsed = JSON.parse(args) as { questions: GenQ[] };
  return (parsed.questions ?? []).filter((q) => q.text && q.options?.length === 4 && q.correct_index >= 0 && q.correct_index <= 3);
}

async function assertAdmin(supa: typeof supabaseAdmin, userId: string) {
  const { data: roles } = await supa.from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) throw new Error("Admin only");
}

export async function adminCreateContestImpl(
  data: any,
  context: { userId: string },
) {
    await assertAdmin(supabaseAdmin, context.userId);

    const mix = data.difficulty_mix;
    const sum = mix.easy + mix.medium + mix.hard;
    if (sum <= 0) throw new Error("Difficulty mix cannot be all zero");
    const targetEasy   = Math.round((data.total_questions * mix.easy)   / sum);
    const targetHard   = Math.round((data.total_questions * mix.hard)   / sum);
    const targetMedium = data.total_questions - targetEasy - targetHard;

    // Pull all candidate questions from qb_questions for the chosen chapters.
    // Priority ordering: rich formats first (match, assertion, statement,
    // diagram), then standard MCQ.
    const chapterBigints = data.chapter_ids
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (!chapterBigints.length) throw new Error("Invalid chapter ids");

    const { data: pool, error: qErr } = await supabaseAdmin
      .from("qb_questions" as never)
      .select("id,difficulty,qtype,question_image_url")
      .in("chapter_id", chapterBigints as never)
      .limit(5000) as unknown as {
        data: Array<{ id: number | string; difficulty: string | null; qtype: string | null; question_image_url: string | null }> | null;
        error: { message: string } | null;
      };
    if (qErr) throw new Error(qErr.message);
    if (!pool?.length) throw new Error("No questions found for selected chapters");

    const priority = (q: (typeof pool)[number]) => {
      const t = (q.qtype ?? "").toLowerCase();
      if (t.includes("match")) return 1;
      if (t.includes("assertion")) return 2;
      if (t.includes("type-2") || t.includes("type-3")) return 3;
      if (q.question_image_url || t.includes("diagram") || t.includes("graph") || t.includes("figure")) return 4;
      return 5;
    };
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    shuffled.sort((a, b) => priority(a) - priority(b));

    const bucket = (diff: string) =>
      shuffled.filter((q) => (q.difficulty ?? "").toLowerCase() === diff.toLowerCase());
    const easyPool = bucket("Easy");
    const medPool  = bucket("Medium");
    const hardPool = bucket("Hard");

    const take = (arr: typeof shuffled, n: number) => arr.slice(0, Math.max(0, n));
    const picked = [
      ...take(easyPool, targetEasy),
      ...take(medPool, targetMedium),
      ...take(hardPool, targetHard),
    ];
    // Backfill if any bucket was short.
    if (picked.length < data.total_questions) {
      const usedIds = new Set(picked.map((q) => String(q.id)));
      for (const q of shuffled) {
        if (picked.length >= data.total_questions) break;
        if (!usedIds.has(String(q.id))) { picked.push(q); usedIds.add(String(q.id)); }
      }
    }
    if (picked.length < 5) throw new Error(`Only ${picked.length} questions available in the selected chapters`);

    const questionIds = picked.map((q) => String(q.id));

    const startsAt = new Date(data.starts_at);
    const endsAt = new Date(startsAt.getTime() + data.duration_min * 60_000);

    const { data: test, error: tErr } = await supabaseAdmin.from("tests").insert({
      title: data.title, description: data.description ?? null, type: "contest", difficulty: "medium",
      duration_min: data.duration_min, total_questions: questionIds.length,
      is_paid: false, entry_fee: 0, prize_pool: 0,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      question_ids: questionIds, marks_correct: 4, marks_wrong: -1,
      source: "DAILY-LIVE-QUIZ", created_by: context.userId,
    }).select("id").single();
    if (tErr) throw new Error(tErr.message);

    const { data: contest, error: cErr } = await supabaseAdmin.from("contests").insert({
      title: data.title, description: data.description ?? null,
      prize_pool: 0, entry_fee: 0,
      starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      duration_min: data.duration_min, total_questions: questionIds.length,
      // contests.question_ids is uuid[]; leave empty and rely on tests.question_ids for solutions.
      chapter_ids: [], question_ids: [],
      test_id: test.id, created_by: context.userId,
    }).select("id").single();
    if (cErr) throw new Error(cErr.message);

    return { contest_id: contest.id, test_id: test.id, questions: questionIds.length };
}

export async function joinContestImpl(
  data: { contest_id: string; entry_fee?: number },
  context: { userId: string; supabase: SupabaseClient<any, any, any> },
) {
    // Daily Live Quiz is free — always send fee=0. Explicitly target the
    // 2-argument overload to avoid PostgREST overload ambiguity.
    let resolvedEntryId: string | null = null;
    const { data: entryId, error } = await context.supabase.rpc("join_contest", {
      _contest_id: data.contest_id,
      _fee: 0,
    });
    if (error) {
      // Fallback for legacy single-arg deployments only.
      if (/does not exist|PGRST202|PGRST203|argument/i.test(error.message)) {
        const r2 = await context.supabase.rpc("join_contest", { _contest_id: data.contest_id });
        if (r2.error) throw new Error(r2.error.message);
        resolvedEntryId = r2.data as string;
      } else {
        throw new Error(error.message);
      }
    } else {
      resolvedEntryId = (entryId as string | null) ?? null;
    }

    // Fetch contest metadata for the return value. Wrap in try/catch so a
    // transient RLS/network hiccup can never turn a successful join into a
    // hanging spinner.
    let test_id: string | null = null;
    let title: string | null = null;
    try {
      const { data: contest } = await context.supabase
        .from("contests")
        .select("test_id,title")
        .eq("id", data.contest_id)
        .maybeSingle();
      test_id = contest?.test_id ?? null;
      title = contest?.title ?? null;
    } catch (e) { console.error("contest lookup after join failed", e); }

    // Keep the join response independent from notification delivery. Importing
    // another createServerFn module here also pulls its transformed wrapper into
    // the worker and can delay or break the primary contest mutation.
    try {
      const { error: notificationError } = await supabaseAdmin.from("notifications").insert({
        user_id: context.userId,
        kind: "contest",
        title: `Joined: ${title ?? "Daily Live Quiz"}`,
        body: "You're in. Open the quiz page to play when it starts.",
        link: `/contest/${data.contest_id}`,
      });
      if (notificationError) console.error("notify join failed", notificationError.message);
    } catch (e) {
      console.error("notify join failed", e);
    }

    return { entry_id: resolvedEntryId, test_id };
}

export async function listPastContestsImpl() {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const nowIso = new Date().toISOString();
    // Finalize any ended-but-unfinalized contests
    const { data: pending } = await supabaseAdmin.from("contests")
      .select("id").lte("ends_at", nowIso).eq("status", "scheduled").gte("ends_at", since);
    for (const c of pending ?? []) {
      try { await supabaseAdmin.rpc("finalize_contest", { _contest_id: c.id }); } catch (e) { console.error("finalize", c.id, e); }
    }
    const { data: contests } = await supabaseAdmin.from("contests")
      .select("id,title,prize_pool,entry_fee,starts_at,ends_at,total_questions,status,test_id")
      .lte("ends_at", nowIso).gte("ends_at", since)
      .order("ends_at", { ascending: false }).limit(30);

    const out: Array<{
      id: string; title: string; prize_pool: number; entry_fee: number;
      starts_at: string; ends_at: string; total_questions: number; status: string; test_id: string;
      entries_count: number;
      leaderboard: { user_id: string; full_name: string | null; rank: number; score: number; prize_amount: number }[];
    }> = [];
    for (const c of contests ?? []) {
      const [{ count }, { data: results }] = await Promise.all([
        supabaseAdmin.from("contest_entries").select("id", { count: "exact", head: true }).eq("contest_id", c.id),
        supabaseAdmin.from("contest_results")
          .select("user_id,rank,score,prize_amount,profiles:user_id(full_name)")
          .eq("contest_id", c.id).order("rank", { ascending: true }).limit(10),
      ]);
      out.push({
        ...c, entries_count: count ?? 0,
        leaderboard: (results ?? []).map((r) => ({
          user_id: r.user_id, rank: r.rank, score: Number(r.score), prize_amount: Number(r.prize_amount),
          full_name: (r as any).profiles?.full_name ?? null,
        })),
      });
    }
    return out;
}


export async function getContestDetailImpl(
  data: { contest_id: string },
  context: { userId: string },
) {
    const { data: c, error: cErr } = await supabaseAdmin
      .from("contests")
      .select("id,title,description,prize_pool,entry_fee,starts_at,ends_at,duration_min,total_questions,status,test_id,question_ids")
      .eq("id", data.contest_id)
      .maybeSingle();
    if (cErr || !c) throw new Error("Contest not found");

    const ended = new Date(c.ends_at).getTime() <= Date.now();
    // Lazy finalize if window closed
    if (ended && c.status !== "finalized") {
      try { await supabaseAdmin.rpc("finalize_contest", { _contest_id: c.id }); } catch {/* ignore */}
    }

    // NOTE: `entry_fee` on contest_entries is added by db/battlegrounds-user-stakes.sql.
    // Until the user runs that migration the typegen lacks the column, so we cast.
    const entriesAll = supabaseAdmin
      .from("contest_entries")
      .select("user_id, entry_fee")
      .eq("contest_id", c.id) as unknown as Promise<{
        data: Array<{ user_id: string; entry_fee: number | null }> | null;
      }>;
    const myEntryReq = supabaseAdmin
      .from("contest_entries")
      .select("id, attempt_id, entry_fee")
      .eq("contest_id", c.id)
      .eq("user_id", context.userId)
      .maybeSingle() as unknown as Promise<{
        data: { id: string; attempt_id: string | null; entry_fee: number | null } | null;
      }>;

    const [{ count: entriesCount }, { data: myEntry }, { data: results }, { data: entries }] =
      await Promise.all([
        supabaseAdmin
          .from("contest_entries")
          .select("id", { count: "exact", head: true })
          .eq("contest_id", c.id),
        myEntryReq,
        // No FK join here — relational embeds silently return empty when the
        // FK relationship isn't declared, which breaks the leaderboard.
        supabaseAdmin
          .from("contest_results")
          .select("user_id,rank,score,prize_amount")
          .eq("contest_id", c.id)
          .order("rank", { ascending: true })
          .limit(100),
        entriesAll,
      ]);


    const joiners = entriesCount ?? (entries?.length ?? 0);

    // Pool = SUM of per-user stakes when any are non-zero, otherwise
    // legacy: contest entry_fee × joiners, otherwise the configured prize_pool.
    const stakeSum = (entries ?? []).reduce(
      (a, e: { entry_fee: number | null }) => a + (Number(e.entry_fee) || 0),
      0,
    );
    const legacyFee = Number(c.entry_fee) || 0;
    const prizePool =
      stakeSum > 0
        ? Math.round(stakeSum * 100) / 100
        : legacyFee > 0
          ? Math.round(legacyFee * joiners * 100) / 100
          : Number(c.prize_pool) || 0;
    const split = computePrizeSplit(prizePool, joiners);

    type Row = {
      user_id: string; rank: number; score: number; prize_amount: number;
      full_name: string | null; avatar_url: string | null;
    };

    // Resolve profile names for ALL participants in one batch, no fragile FK joins.
    const allUserIds = Array.from(
      new Set<string>([
        ...(results ?? []).map((r) => r.user_id as string),
        ...(entries ?? []).map((e) => e.user_id as string),
      ]),
    );
    const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    if (allUserIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,avatar_url")
        .in("id", allUserIds);
      for (const p of profs ?? []) {
        profileMap.set(p.id as string, {
          full_name: (p.full_name as string | null) ?? null,
          avatar_url: (p.avatar_url as string | null) ?? null,
        });
      }
    }

    let leaderboard: Row[] = [];
    const finalized = (results ?? []).length > 0;
    if (finalized) {
      leaderboard = (results ?? []).map((r) => {
        const p = profileMap.get(r.user_id as string);
        return {
          user_id: r.user_id as string,
          rank: r.rank as number,
          score: Number(r.score),
          prize_amount: Number(r.prize_amount),
          full_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
        };
      });
    } else {
      // Build a LIVE leaderboard from entries + their latest completed attempt.
      const userIds = (entries ?? []).map((e) => e.user_id as string);
      const attemptByUser = new Map<string, { score: number; tsec: number }>();
      if (c.test_id && userIds.length) {
        const { data: atts } = await supabaseAdmin
          .from("attempts")
          .select("user_id,score,time_taken_sec,submitted_at,status")
          .eq("test_id", c.test_id)
          .eq("status", "completed")
          .in("user_id", userIds)
          .order("submitted_at", { ascending: false });
        for (const a of atts ?? []) {
          if (!attemptByUser.has(a.user_id as string)) {
            attemptByUser.set(a.user_id as string, {
              score: Number(a.score) || 0,
              tsec: Number(a.time_taken_sec) || 999999,
            });
          }
        }
      }
      leaderboard = (entries ?? [])
        .map((e) => {
          const uid = e.user_id as string;
          const a = attemptByUser.get(uid);
          const p = profileMap.get(uid);
          return {
            user_id: uid,
            score: a?.score ?? 0,
            tsec: a?.tsec ?? 999999,
            full_name: p?.full_name ?? null,
            avatar_url: p?.avatar_url ?? null,
          };
        })
        .sort((x, y) => (y.score - x.score) || (x.tsec - y.tsec))
        .map((r, i) => ({
          user_id: r.user_id,
          rank: i + 1,
          score: r.score,
          prize_amount: split[i] ?? 0,
          full_name: r.full_name,
          avatar_url: r.avatar_url,
        }));
    }

    // ----- Inject 6 bot players. Bots ALWAYS occupy top-3 with believable
    // scores that are strictly greater than every real player AND ≤ max score.
    // Bot prize_amount is 0 — real users keep the prize they actually earned.
    {
      const maxScore = Math.max(1, Number(c.total_questions ?? 0)) * 4;
      const topReal = leaderboard.reduce((m, r) => Math.max(m, Number(r.score) || 0), 0);
      // Hashed seed for stable per-contest bot identities
      let seed = 0;
      for (let i = 0; i < c.id.length; i++) seed = (seed * 31 + c.id.charCodeAt(i)) | 0;
      const rand = (i: number) => {
        const x = Math.sin((seed + i * 9301 + 49297) % 233280) * 10000;
        return x - Math.floor(x);
      };
      const BOT_POOL = [
        "Aarav Prime", "Meera Ace", "Vihaan Pro", "Isha Spark", "Kabir Nova",
        "Tara Flux", "Arjun Nair", "Anaya Verma", "Rohan Pillai", "Diya Khanna",
        "Ishaan Rao", "Sneha Iyer",
      ];
      // Pick 6 deterministic, unique names per contest. The previous retry
      // loop derived its next index from `chosen.length`; after a collision the
      // length did not change, so it retried the same index forever and the
      // worker hit its CPU limit. Sort once instead, which is bounded.
      const chosen = BOT_POOL
        .map((name, index) => ({ name, order: rand(index + 1) }))
        .sort((a, b) => a.order - b.order)
        .slice(0, 6)
        .map(({ name }) => name);
      // Build 6 strictly-decreasing scores in (topReal, maxScore].
      // Floor at topReal+1; ceil at maxScore. If room is tight, allow equal
      // adjacent bot scores but never < topReal+1 and never > maxScore.
      const minBot = Math.min(maxScore, topReal + 1);
      const span = Math.max(0, maxScore - minBot);
      const botScores: number[] = [];
      for (let i = 0; i < 6; i++) {
        // bot[0] is the strongest; bot[5] is the weakest above the user
        const portion = span === 0 ? 0 : 1 - i / 6 - rand(i + 10) * 0.05;
        const s = Math.round(minBot + span * Math.max(0, Math.min(1, portion)));
        botScores.push(Math.max(minBot, Math.min(maxScore, s)));
      }
      // Enforce strictly non-increasing while preserving the floor
      for (let i = 1; i < botScores.length; i++) {
        if (botScores[i] > botScores[i - 1]) botScores[i] = botScores[i - 1];
        if (botScores[i] < minBot) botScores[i] = minBot;
      }
      const botRows: Row[] = chosen.map((name, i) => ({
        user_id: `bot:${c.id}:${i}`,
        rank: 0,
        score: botScores[i],
        prize_amount: 0,
        full_name: name,
        avatar_url: null,
      }));
      // Merge + sort by score desc; ties keep bots above real users
      const merged = [...botRows, ...leaderboard];
      merged.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aBot = a.user_id.startsWith("bot:");
        const bBot = b.user_id.startsWith("bot:");
        if (aBot !== bBot) return aBot ? -1 : 1;
        return 0;
      });
      leaderboard = merged.map((r, i) => ({ ...r, rank: i + 1 }));
    }

    // Solutions: only show after contest end. Prefer contests.question_ids
    // (legacy) and fall back to the linked test.question_ids (new flow).
    let questions: Array<{
      id: string; text: string; options: string[]; correct_index: number;
      explanation: string | null; difficulty: string;
    }> = [];
    if (ended) {
      let order: string[] = (c.question_ids as unknown as string[]) ?? [];
      if (!order.length && c.test_id) {
        const { data: t } = await supabaseAdmin
          .from("tests").select("question_ids").eq("id", c.test_id).maybeSingle();
        order = ((t?.question_ids as string[] | null) ?? []);
      }
      if (order.length) {
        // Question bank uses `qb_questions` (bigint id, question_html, jsonb options).
        // Map to the shape the Solutions UI expects.
        const idNums = order.map((s) => Number(s)).filter((n) => Number.isFinite(n));
        type QbRow = {
          id: number; question_html: string; options: unknown;
          correct_index: number; explanation: string | null; difficulty: string;
        };
        const { data: qs } = (await (supabaseAdmin as any)
          .from("qb_questions")
          .select("id,question_html,options,correct_index,explanation,difficulty")
          .in("id", idNums)) as { data: QbRow[] | null };
        const byId = new Map<string, QbRow>();
        for (const q of qs ?? []) byId.set(String(q.id), q);
        questions = order
          .map((id) => byId.get(id))
          .filter((q): q is QbRow => !!q)
          .map((q) => {
            const opts = Array.isArray(q.options)
              ? (q.options as unknown[]).map((o) =>
                  typeof o === "string" ? o : (o as { text?: string })?.text ?? String(o),
                )
              : [];
            return {
              id: String(q.id),
              text: q.question_html,
              options: opts,
              correct_index: q.correct_index,
              explanation: q.explanation,
              difficulty: q.difficulty,
            };
          });
      }
    }

    return {
      contest: { ...c, prize_pool: prizePool },
      ended,
      entries_count: joiners,
      prize_pool: prizePool,
      prize_split: split,
      my_entry: myEntry ?? null,
      leaderboard,
      questions,
    };
}
