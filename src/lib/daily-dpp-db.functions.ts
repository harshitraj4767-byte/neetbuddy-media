import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Generates DAILY DPPs entirely from the question bank (qb_questions).
// NO AI. Each DPP:
//   • title:   "<chapter name> #QUIZ<n>"     where n = per-chapter counter
//   • 10 questions from the chapter (mixed difficulty & qtype)
//   • 15 minute timer, +4 / -1 NEET marking, type='daily', live 24h
//   • syllabus jsonb stores subject_name + chapter_name for the UI

type QbQ = { id: number; difficulty: string; qtype: string };
type Chap = { id: number; name: string; subject_id: string };

function pickMixed(pool: QbQ[], n: number): QbQ[] {
  // Group by difficulty
  const easy = pool.filter((q) => /easy/i.test(q.difficulty));
  const med  = pool.filter((q) => /medium|mod/i.test(q.difficulty));
  const hard = pool.filter((q) => /hard/i.test(q.difficulty));
  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const want = { easy: Math.round(n * 0.3), med: Math.round(n * 0.5), hard: n - Math.round(n * 0.3) - Math.round(n * 0.5) };
  const out: QbQ[] = [
    ...shuffle(easy).slice(0, want.easy),
    ...shuffle(med).slice(0, want.med),
    ...shuffle(hard).slice(0, want.hard),
  ];
  if (out.length < n) {
    const seen = new Set(out.map((q) => q.id));
    for (const q of shuffle(pool)) {
      if (out.length >= n) break;
      if (!seen.has(q.id)) { out.push(q); seen.add(q.id); }
    }
  }
  return shuffle(out).slice(0, n);
}

export const generateDailyDppsFromDb = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    count: z.number().int().min(1).max(20).optional(),
    questions_per_dpp: z.number().int().min(15).max(30).optional(),
    duration_min: z.number().int().min(5).max(120).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const count = data.count ?? 1;
    const qCount = data.questions_per_dpp ?? 25;
    const duration = data.duration_min ?? 30;

    // 1) Chapters that have enough questions
    const { data: chapters, error: chErr } = await admin
      .from("qb_chapters")
      .select("id,name,subject_id,question_count")
      .gte("question_count", qCount);
    if (chErr) throw new Error(chErr.message);
    const eligible = (chapters ?? []) as (Chap & { question_count: number })[];
    if (eligible.length === 0) return { created: 0, errors: ["No chapters have enough questions"] };

    // Prefer the richest chapters (best question pools), then pick randomly among the top slice
    const ranked = [...eligible].sort((a, b) => (b.question_count ?? 0) - (a.question_count ?? 0));
    const topSlice = ranked.slice(0, Math.max(count * 5, 20));
    const shuffled = topSlice.map((c) => [Math.random(), c] as const).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    const chosen = shuffled.slice(0, count);

    // Subject id -> display name
    const { data: subs } = await admin.from("qb_subjects").select("id,name");
    const subjectName = new Map<string, string>((subs ?? []).map((s: any) => [s.id, s.name]));

    const now = new Date();
    const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const created: Array<{ id: string; title: string }> = [];
    const errors: string[] = [];

    for (const ch of chosen) {
      try {
        // Pull the chapter's questions
        const { data: qs, error: qErr } = await admin
          .from("qb_questions")
          .select("id,difficulty,qtype")
          .eq("chapter_id", ch.id)
          .limit(500);
        if (qErr) throw new Error(qErr.message);
        const pool = (qs ?? []) as QbQ[];
        if (pool.length < qCount) { errors.push(`${ch.name}: only ${pool.length} questions`); continue; }
        const picked = pickMixed(pool, qCount);
        if (picked.length < qCount) { errors.push(`${ch.name}: could not build set`); continue; }
        const questionIds = picked.map((q) => String(q.id));

        const subject = subjectName.get(ch.subject_id) ?? ch.subject_id;

        // Per-chapter counter — count existing tests whose title starts with "<subject> - <chapter> #QUIZ"
        const prefix = `${subject} - ${ch.name} #QUIZ`;
        const { count: existing } = await admin
          .from("tests")
          .select("id", { count: "exact", head: true })
          .ilike("title", `${prefix}%`);
        const quizNo = (existing ?? 0) + 1;
        const title = `${prefix}${quizNo}`;

        // Compute display difficulty as majority difficulty
        const dCount = { Easy: 0, Medium: 0, Hard: 0 } as Record<string, number>;
        for (const q of picked) {
          const k = /easy/i.test(q.difficulty) ? "Easy" : /hard/i.test(q.difficulty) ? "Hard" : "Medium";
          dCount[k]++;
        }
        const difficulty = (Object.entries(dCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Medium").toLowerCase();



        const { data: t, error: tErr } = await admin.from("tests").insert({
          title,
          description: `${subject} · ${ch.name} · Daily practice`,
          type: "daily",
          difficulty,
          duration_min: duration,
          total_questions: questionIds.length,
          marks_correct: 4,
          marks_wrong: -1,
          source: "Question Bank",
          question_ids: questionIds,
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          syllabus: { subject_id: ch.subject_id, subject_name: subject, chapter_id: String(ch.id), chapter_name: ch.name, quiz_no: quizNo },
        }).select("id,title").maybeSingle();
        if (tErr || !t) throw new Error(tErr?.message ?? "insert failed");
        created.push(t as any);
      } catch (e) {
        errors.push(`${ch.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { created: created.length, errors, items: created };
  });
