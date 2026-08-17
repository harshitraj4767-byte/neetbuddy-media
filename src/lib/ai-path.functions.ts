import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAiGatewayWithRotation } from "@/lib/ai-keys.functions";
import { neetHistoryPromptBlock } from "@/lib/neet-history";

/**
 * AI Path is a weekly-cadence tool. It is free (no bonus charge) but is
 * rate-limited: a new 7-day plan can only be generated after the previous
 * plan is complete OR after 7 days have elapsed since it was created.
 * When a week is done, the user first generates a "weekly report" and then
 * generates the next week's plan.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const QUIZ_QUESTIONS_PER_DAY = 50;
const DIFF_MIX: Array<{ diff: string; share: number }> = [
  { diff: "Easy", share: 0.35 },
  { diff: "Medium", share: 0.45 },
  { diff: "Hard", share: 0.20 },
];

async function gatherUserStats(userId: string) {
  const { data: attempts } = await supabaseAdmin
    .from("attempts")
    .select("id,score,correct_count,wrong_count,submitted_at,answers,tests:test_id(type,total_questions)")
    .eq("user_id", userId).eq("status", "completed")
    .order("submitted_at", { ascending: false }).limit(40);
  const list = (attempts ?? []) as any[];

  const qIds = new Set<string>();
  for (const a of list) {
    const ans = (a?.answers ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(ans)) qIds.add(k);
  }
  const qArr = Array.from(qIds).slice(0, 4000);
  const { data: qs } = qArr.length
    ? await supabaseAdmin
        .from("questions")
        .select("id,correct_index,difficulty,subjects:subject_id(name),chapters:chapter_id(name)")
        .in("id", qArr)
    : { data: [] as any[] };
  const qMap = new Map<string, any>();
  for (const q of (qs ?? []) as any[]) qMap.set(q.id, q);

  const subjBuckets = new Map<string, { c: number; t: number }>();
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
      const ok = Number(sel) === Number(q.correct_index);
      const s = subjBuckets.get(subj) ?? { c: 0, t: 0 };
      s.t++; if (ok) s.c++; subjBuckets.set(subj, s);
      const chapKey = `${subj}::${chap}`;
      const cb = chapBuckets.get(chapKey) ?? { subject: subj, c: 0, t: 0 };
      cb.t++; if (ok) cb.c++; chapBuckets.set(chapKey, cb);
      const db = diffBuckets.get(diff) ?? { c: 0, t: 0 };
      db.t++; if (ok) db.c++; diffBuckets.set(diff, db);
    }
  }

  const subjects = Array.from(subjBuckets.entries()).map(([subject, v]) => ({
    subject, attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0,
  }));
  const weakChapters = Array.from(chapBuckets.entries())
    .map(([k, v]) => ({ subject: v.subject, chapter: k.split("::")[1], attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0 }))
    .filter((r) => r.attempted >= 3)
    .sort((a, b) => a.accuracy - b.accuracy).slice(0, 10);
  const byDifficulty = Array.from(diffBuckets.entries()).map(([difficulty, v]) => ({
    difficulty, attempted: v.t, accuracy: v.t ? Math.round((v.c / v.t) * 100) : 0,
  }));
  const trend = list.slice(0, 10).reverse().map((a) => ({
    score: Number(a.score ?? 0),
    total: Number(a.tests?.total_questions ?? 0) * 4,
    type: a.tests?.type ?? "quiz",
    submitted_at: a.submitted_at,
  }));
  return { attempts: list.length, subjects, weak_chapters: weakChapters, by_difficulty: byDifficulty, recent_trend: trend };
}

async function attachQuizResults(userId: string, payload: any) {
  const days = (payload?.days ?? []) as any[];
  const ids = days.map((d) => d?.quiz_id).filter(Boolean) as string[];
  if (ids.length === 0) return payload;
  const { data: attempts } = await supabaseAdmin
    .from("attempts")
    .select("test_id,score,correct_count,wrong_count,submitted_at,status")
    .eq("user_id", userId).eq("status", "completed").in("test_id", ids)
    .order("submitted_at", { ascending: false });
  const best = new Map<string, any>();
  for (const a of (attempts ?? []) as any[]) {
    if (!best.has(a.test_id)) best.set(a.test_id, a);
  }
  payload.days = days.map((d) => ({
    ...d,
    quiz_result: d.quiz_id ? best.get(d.quiz_id) ?? null : null,
  }));
  return payload;
}

/** All task keys expected for a day = `d<day>_<index>` for each daily_tasks entry. */
function totalTaskKeys(payload: any): string[] {
  const keys: string[] = [];
  for (const d of (payload?.days ?? []) as any[]) {
    const tasks = (d?.daily_tasks ?? []) as string[];
    for (let i = 0; i < tasks.length; i++) keys.push(`d${d.day}_${i}`);
  }
  return keys;
}
function isCompleted(payload: any, progress: Record<string, boolean>): boolean {
  const keys = totalTaskKeys(payload);
  if (keys.length === 0) return false;
  return keys.every((k) => progress?.[k] === true);
}

export const getCurrentPath = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("ai_paths" as never)
      .select("id,start_date,payload,progress,report,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) (data as any).payload = await attachQuizResults(context.userId, (data as any).payload ?? {});
    const path = data as any;
    if (!path) {
      return { path: null, completed: false, canRegenerate: true, nextEligibleAt: null as string | null };
    }
    const completed = isCompleted(path.payload, path.progress ?? {});
    const createdMs = new Date(path.created_at).getTime();
    const weekElapsed = Date.now() - createdMs >= WEEK_MS;
    const canRegenerate = completed || weekElapsed;
    const nextEligibleAt = canRegenerate ? null : new Date(createdMs + WEEK_MS).toISOString();
    return { path, completed, canRegenerate, nextEligibleAt };
  });

/** Build a 50-question day quiz from the quality question pool, honouring
 * subject weightage (Bio 25, Chem 12, Physics 13) and difficulty mix 35/45/20. */
async function buildDayQuiz(userId: string, dayNum: number, focusSubject: string, chapterHints: string[]): Promise<string | null> {
  const hints = (chapterHints ?? []).map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 8);
  if (hints.length === 0) return null;
  const orExpr = hints.map((h) => `name.ilike.%${h.replace(/[%,]/g, " ")}%`).join(",");
  const { data: chaps } = await supabaseAdmin
    .from("chapters").select("id,name,subject_id,subjects:subject_id(name)").or(orExpr).limit(40);
  const chList = ((chaps ?? []) as any[]);
  if (chList.length === 0) return null;
  const chapIds = chList.map((c) => c.id);

  // Pull quality questions only.
  const { data: qs } = await supabaseAdmin
    .from("questions")
    .select("id,chapter_id,difficulty,explanation,text,options,correct_index,subjects:subject_id(name)")
    .in("chapter_id", chapIds)
    .not("options", "is", null)
    .not("correct_index", "is", null)
    .not("explanation", "is", null)
    .limit(2000);
  const quality = ((qs ?? []) as any[])
    .filter((q) => Array.isArray(q.options) && q.options.length === 4)
    .filter((q) => typeof q.explanation === "string" && q.explanation.length > 25)
    .filter((q) => typeof q.text === "string" && q.text.length >= 25 && q.text.length <= 700)
    .filter((q) => Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3);
  if (quality.length < 10) return null;

  // Bucket by difficulty; case-insensitive canonicalize.
  const bucket: Record<string, any[]> = { Easy: [], Medium: [], Hard: [] };
  for (const q of quality) {
    const d = String(q.difficulty ?? "").toLowerCase();
    if (d.startsWith("e")) bucket.Easy.push(q);
    else if (d.startsWith("h")) bucket.Hard.push(q);
    else bucket.Medium.push(q);
  }
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const k of Object.keys(bucket)) shuffle(bucket[k]);

  const n = Math.min(QUIZ_QUESTIONS_PER_DAY, quality.length);
  const want = { Easy: Math.round(n * DIFF_MIX[0].share), Medium: Math.round(n * DIFF_MIX[1].share), Hard: 0 };
  want.Hard = n - want.Easy - want.Medium;
  const picked: any[] = [];
  const used = new Set<string>();
  for (const key of ["Easy", "Medium", "Hard"] as const) {
    for (const q of bucket[key]) {
      if (picked.length >= (key === "Easy" ? want.Easy : key === "Medium" ? want.Easy + want.Medium : n)) break;
      if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
    }
  }
  // Top-up if any bucket was short.
  if (picked.length < n) {
    for (const q of shuffle([...quality])) {
      if (picked.length >= n) break;
      if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
    }
  }
  shuffle(picked);
  const ids = picked.slice(0, n).map((q) => q.id as string);
  if (ids.length < 10) return null;

  const { data: inserted, error } = await supabaseAdmin
    .from("tests")
    .insert({
      title: `AI Path — Day ${dayNum} • ${focusSubject}`,
      description: `Auto-generated 50-question DPP for AI Path day ${dayNum}. Chapters: ${hints.join(", ")}. Difficulty mix 35% Easy / 45% Medium / 20% Hard.`,
      type: "custom",
      difficulty: "mix",
      duration_min: Math.max(30, Math.min(75, ids.length)),
      total_questions: ids.length,
      is_paid: false,
      source: "AI Path",
      question_ids: ids,
      marks_correct: 4,
      marks_wrong: -1,
      syllabus: { ai_path: true, day: dayNum, chapters: hints } as any,
      created_by: userId,
    } as any)
    .select("id")
    .single();
  if (error || !inserted) return null;
  return (inserted as any).id as string;
}

export const generateAiPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_focus?: string } | undefined) =>
    z.object({ user_focus: z.string().max(500).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Weekly rate limit check.
    const { data: latest } = await supabaseAdmin
      .from("ai_paths" as never)
      .select("id,payload,progress,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) {
      const l: any = latest;
      const completed = isCompleted(l.payload, l.progress ?? {});
      const weekElapsed = Date.now() - new Date(l.created_at).getTime() >= WEEK_MS;
      if (!completed && !weekElapsed) {
        const nextAt = new Date(new Date(l.created_at).getTime() + WEEK_MS);
        throw new Error(`AI Path is once per week. Complete this week's tasks, or come back on ${nextAt.toLocaleDateString()}.`);
      }
    }

    const stats = await gatherUserStats(context.userId);
    const userFocus = (data?.user_focus ?? "").trim();

    const sys = `You are an elite NEET-UG coach who has trained AIR-1 rankers.
Design a hyper-personalized 7-day study plan based on the student's real Neet Buddy stats.

REALITY RULES:
1. A real NEET aspirant studies MULTIPLE subjects in a single day. Every day MUST cover 2-3 subjects across Physics, Chemistry, Biology.
2. Diagnose first: identify the weakest subject and the 2-3 weakest chapters from the stats. Address them across the week, but also rotate strong subjects for retention.
3. Prioritize weight by chapter weightage in NEET (Biology > Physics > Chemistry for marks share).
4. Each day requires:
   - subjects[]: 2-3 subject names touched that day.
   - focus_subject: the single primary subject of the day (used for the auto-quiz).
   - topics[]: 3-6 specific chapters spanning those subjects.
   - daily_tasks[]: 4-7 concrete tasks (e.g. "Solve 25 MCQs on Human Reproduction — Menstrual Cycle", "Revise NCERT Class 12 Ch 8 pages 121-134 + 30 flashcards").
   - quiz_chapters[]: 3-5 real NEET chapter names (Human Reproduction, Alternating Current, p-block Elements, etc.) — the day's auto-quiz samples from these.
   - time_min (240-360)
   - motivation_note (short, warm, non-generic).
5. Mix DPPs, PYQs, NCERT reading, revision, and one full mock in the week.
6. If accuracy < 40% in a subject: schedule revision + easy DPP first, then medium. If > 75%: schedule PYQs + hard DPP.
${userFocus ? `7. STUDENT-DECLARED FOCUS: "${userFocus}". Weave into ≥3 days and mention in summary.` : ""}
Output via tool call only.

${neetHistoryPromptBlock()}`;
    const userMsg = `Student stats JSON:\n${JSON.stringify(stats, null, 2)}${userFocus ? `\n\nStudent focus request: ${userFocus}` : ""}`;

    const res = await callAiGatewayWithRotation("/v1/chat/completions", {
      model: "google/gemini-2.5-pro",
      temperature: 0.4,
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      tools: [{
        type: "function",
        function: {
          name: "emit_plan",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string" },
              days: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    day: { type: "integer" },
                    subjects: { type: "array", items: { type: "string" } },
                    focus_subject: { type: "string" },
                    topics: { type: "array", items: { type: "string" } },
                    daily_tasks: { type: "array", items: { type: "string" } },
                    quiz_chapters: { type: "array", items: { type: "string" } },
                    time_min: { type: "integer" },
                    motivation_note: { type: "string" },
                  },
                  required: ["day", "subjects", "focus_subject", "topics", "daily_tasks", "quiz_chapters", "time_min", "motivation_note"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "days"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_plan" } },
    });
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no plan");
    const payload = JSON.parse(args);

    if (Array.isArray(payload.days)) {
      for (const d of payload.days) {
        try {
          const qid = await buildDayQuiz(context.userId, d.day, d.focus_subject ?? "Practice", d.quiz_chapters ?? d.topics ?? []);
          if (qid) d.quiz_id = qid;
        } catch { /* non-fatal */ }
      }
    }
    if (userFocus) payload.user_focus = userFocus;

    const { data: inserted, error } = await supabaseAdmin
      .from("ai_paths" as never)
      .insert({
        user_id: context.userId,
        start_date: new Date().toISOString().slice(0, 10),
        payload,
        progress: {},
      } as never)
      .select("id,start_date,payload,progress,report,created_at")
      .single();
    if (error) throw new Error(error.message);
    return { path: inserted };
  });

export const updatePathProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path_id: string; key: string; done: boolean }) =>
    z.object({
      path_id: z.string().uuid(),
      key: z.string().min(1).max(50),
      done: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ai_paths" as never)
      .select("progress")
      .eq("id", data.path_id).eq("user_id", context.userId).maybeSingle();
    if (!row) throw new Error("Path not found");
    const progress = { ...((row as any).progress ?? {}), [data.key]: data.done };
    const { error } = await supabaseAdmin
      .from("ai_paths" as never)
      .update({ progress } as never)
      .eq("id", data.path_id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { progress };
  });

/** Generate a "week is done" improvement report. Only allowed when every task is checked. */
export const generateWeeklyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path_id: string }) => z.object({ path_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("ai_paths" as never)
      .select("id,payload,progress,report,created_at")
      .eq("id", data.path_id).eq("user_id", context.userId).maybeSingle();
    if (!row) throw new Error("Path not found");
    const path: any = row;
    if (path.report) return { report: path.report, path };
    if (!isCompleted(path.payload, path.progress ?? {})) {
      throw new Error("Finish all tasks first — the weekly report unlocks when every checkbox is done.");
    }

    // Pull attempts across the week for the AI-generated day quizzes.
    const dayQuizIds = ((path.payload?.days ?? []) as any[]).map((d) => d?.quiz_id).filter(Boolean);
    const { data: attempts } = dayQuizIds.length
      ? await supabaseAdmin
          .from("attempts")
          .select("test_id,score,correct_count,wrong_count,submitted_at")
          .eq("user_id", context.userId).eq("status", "completed")
          .in("test_id", dayQuizIds)
      : { data: [] as any[] };

    const stats = await gatherUserStats(context.userId);

    const sys = `You are an elite NEET coach. The student has just finished a 7-day plan on Neet Buddy. Produce a short, honest improvement report.

Return via tool call only:
- wins: 3-5 concrete achievements grounded in the data.
- gaps: 3-5 specific chapters/topics that still need work.
- accuracy_delta: a short sentence about the trend across the week.
- next_week_focus: 4-6 chapters/skills the next 7-day plan should attack, ordered by priority.
Keep every string under 200 chars.`;
    const userMsg = `This week's plan summary: ${path.payload?.summary ?? ""}\n\nDay quizzes attempted this week (${attempts?.length ?? 0}):\n${JSON.stringify(attempts ?? [], null, 2)}\n\nRolling user stats:\n${JSON.stringify(stats, null, 2)}`;

    const res = await callAiGatewayWithRotation("/v1/chat/completions", {
      model: "google/gemini-2.5-flash",
      temperature: 0.3,
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      tools: [{
        type: "function",
        function: {
          name: "emit_report",
          parameters: {
            type: "object",
            properties: {
              wins: { type: "array", items: { type: "string" } },
              gaps: { type: "array", items: { type: "string" } },
              accuracy_delta: { type: "string" },
              next_week_focus: { type: "array", items: { type: "string" } },
            },
            required: ["wins", "gaps", "accuracy_delta", "next_week_focus"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "emit_report" } },
    });
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no report");
    const report = JSON.parse(args);
    report.generated_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("ai_paths" as never)
      .update({ report } as never)
      .eq("id", path.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { report };
  });
