import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mixQuestions, type MixableQuestion } from "./question-mix";
import { CreateCustomTestSchema, DIFFICULTY_DB_VALUE } from "./generate-test.schema";
import { consumeTrialQuota, TRIAL_LIMITS } from "@/lib/trial-limits.server";

/** Creates a custom quiz test by sampling questions from the question bank. */
export const createCustomTestWithBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => CreateCustomTestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Trial: max 3 generated tests per day.
    await consumeTrialQuota(userId, TRIAL_LIMITS.generateTest);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // qb_questions.chapter_id is bigint; cast strings from the client.
    const chapterIds = data.chapter_ids
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (!chapterIds.length) throw new Error("Invalid chapter selection.");

    const admin: any = supabaseAdmin;

    // Pull the fields the mixer needs so rich formats (multi-statement,
    // numerical, diagram, assertion-reason, match) can lead the paper.
    const baseSelect = "id,question_html,qtype,question_image_url";
    const runQuery = async (scope: "all" | "topics" | "subtopics") => {
      let q: any = admin
        .from("qb_questions")
        .select(baseSelect)
        .in("chapter_id", chapterIds)
        .limit(Math.min(4000, data.count * 40));
      if (data.difficulty !== "mix") q = q.eq("difficulty", DIFFICULTY_DB_VALUE[data.difficulty]);
      if (scope === "topics") q = q.in("topic_id", (data.topic_ids ?? []).map(Number));
      if (scope === "subtopics") q = q.in("subtopic_id", (data.subtopic_ids ?? []).map(Number));
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      return (rows ?? []) as Array<{
        id: string | number;
        question_html: string | null;
        qtype: string | null;
        question_image_url: string | null;
      }>;
    };

    const narrowed = (data.topic_ids?.length ?? 0) > 0 || (data.subtopic_ids?.length ?? 0) > 0;
    const raw = narrowed
      ? [
          ...(data.topic_ids?.length ? await runQuery("topics") : []),
          ...(data.subtopic_ids?.length ? await runQuery("subtopics") : []),
        ]
      : await runQuery("all");

    const seen = new Set<string>();
    const pool: MixableQuestion[] = [];
    for (const r of raw) {
      const id = String(r.id);
      if (seen.has(id)) continue;
      seen.add(id);
      pool.push({ id, text: r.question_html, qtype: r.qtype, question_image_url: r.question_image_url });
    }
    if (!pool.length) throw new Error("No questions match — try different filters.");

    const ids = mixQuestions(pool, `${userId}:${Date.now()}`)
      .slice(0, data.count)
      .map((q) => q.id);

    const { data: t, error: tErr } = await supabaseAdmin
      .from("tests")
      .insert({
        title: `${data.subject_name} Custom Test`,
        type: "custom",
        difficulty: data.difficulty,
        duration_min: data.duration_min,
        total_questions: ids.length,
        question_ids: ids,
        created_by: userId,
        source: "NCERT",
      })
      .select("id")
      .maybeSingle();

    if (tErr || !t) throw new Error(tErr?.message ?? "Could not create test");
    return { testId: t.id, bonusSpent: 0 };
  });
