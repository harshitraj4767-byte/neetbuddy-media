import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assertAdmin,
  cleanQuestion,
  ensureChapter,
  ensureSubject,
  insertQuestions,
  logAdminAction,
} from "./admin-content.server";

const OptionSchema = z.union([
  z.string(),
  z.object({
    text: z.string().optional(),
    image_base64: z.string().nullable().optional(),
    mime: z.string().nullable().optional(),
  }),
]);

const DiagramSchema = z.object({
  data_base64: z.string(),
  mime: z.string().default("image/png"),
  prompt: z.string().nullable().optional(),
});

const QuestionSchema = z.object({
  text: z.string().min(1),
  options: z.array(OptionSchema).min(2),
  correct_index: z.number().int().min(0).max(3),
  difficulty: z.string().optional(),
  source: z.string().optional(),
  marks_correct: z.number().optional(),
  marks_wrong: z.number().optional(),
  explanation: z.string().nullable().optional(),
  subject: z.string().optional(),
  chapter: z.string().optional(),
  topic: z.string().nullable().optional(),
  sub_topic: z.string().nullable().optional(),
  question_type: z.string().optional(),
  is_pyq: z.boolean().optional(),
  pyq_year: z.number().nullable().optional(),
  diagrams: z.array(DiagramSchema).optional(),
});

const TestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().default("quiz"),
  difficulty: z.string().default("medium"),
  duration_min: z.number().int().min(1).max(300),
  source: z.string().default("NCERT"),
  is_paid: z.boolean().default(false),
  entry_fee: z.number().default(0),
  prize_pool: z.number().default(0),
  marks_correct: z.number().default(4),
  marks_wrong: z.number().default(-1),
  questions: z.array(QuestionSchema).min(1).max(2000),
});

const ChapterQuizSchema = z.object({
  subject: z.string().min(1),
  chapter: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  duration_min: z.number().optional(),
  difficulty: z.string().optional(),
  source: z.string().optional(),
  questions: z.array(QuestionSchema).min(1).max(2000),
});

const ChapterSchema = z.object({
  subject: z.string().min(1),
  name: z.string().min(1),
  class: z.number().nullable().optional(),
  order_index: z.number().optional(),
});

export const createAdminTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => TestSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const rows: any[] = [];
    for (const q of data.questions) {
      let subjectId: string | null = null;
      let chapterId: string | null = null;
      if (q.subject) {
        subjectId = (await ensureSubject(q.subject)).id;
        if (q.chapter) chapterId = (await ensureChapter(subjectId!, q.chapter)).id;
      }
      rows.push(cleanQuestion(q, subjectId, chapterId));
    }
    const inserted = await insertQuestions(rows);
    if (!inserted.ids.length) throw new Error(inserted.errors[0] ?? "No questions were inserted");
    const { error: testError } = await supabaseAdmin.from("tests").insert({
      title: data.title,
      description: data.description ?? "",
      type: data.type,
      difficulty: data.difficulty,
      duration_min: data.duration_min,
      source: data.source,
      is_paid: data.is_paid,
      entry_fee: data.entry_fee,
      prize_pool: data.prize_pool,
      total_questions: inserted.ids.length,
      marks_correct: data.marks_correct,
      marks_wrong: data.marks_wrong,
      question_ids: inserted.ids,
      created_by: context.userId,
    });
    if (testError) throw new Error(testError.message);
    await logAdminAction(context.userId, "create_test", null, { title: data.title, questions: inserted.ids.length, errors: inserted.errors });
    return { inserted: inserted.ids.length, errors: inserted.errors };
  });

export const importChapterQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ groups: z.array(ChapterQuizSchema).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let created = 0;
    const logs: string[] = [];
    for (const group of data.groups) {
      try {
        const subject = await ensureSubject(group.subject);
        const chapter = await ensureChapter(subject.id, group.chapter);
        const rows = group.questions.map((q) => cleanQuestion({ ...q, subject: group.subject, chapter: group.chapter }, subject.id, chapter.id));
        const inserted = await insertQuestions(rows);
        if (!inserted.ids.length) {
          logs.push(`❌ ${subject.name} · ${chapter.name}: no questions inserted${inserted.errors[0] ? ` — ${inserted.errors[0]}` : ""}`);
          continue;
        }
        const title = group.title?.trim() || `${subject.name} · ${chapter.name}`;
        const { error } = await supabaseAdmin.from("tests").insert({
          title,
          description: group.description ?? `Chapter quiz: ${chapter.name}`,
          type: "quiz",
          difficulty: group.difficulty ?? "medium",
          duration_min: Math.round(group.duration_min ?? Math.max(10, Math.min(60, inserted.ids.length * 1.5))),
          source: group.source ?? "NCERT",
          total_questions: inserted.ids.length,
          marks_correct: 4,
          marks_wrong: -1,
          question_ids: inserted.ids,
          created_by: context.userId,
        });
        if (error) throw new Error(error.message);
        created++;
        logs.push(`✅ ${title} — ${inserted.ids.length} questions${inserted.errors.length ? ` (${inserted.errors.length} row warnings)` : ""}`);
      } catch (e) {
        logs.push(`❌ ${group.subject} · ${group.chapter}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await logAdminAction(context.userId, "chapter_quiz_import", null, { created, logs: logs.slice(0, 50) });
    return { created, logs };
  });

export const importChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ chapters: z.array(ChapterSchema).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let created = 0;
    let skipped = 0;
    const logs: string[] = [];
    for (const row of data.chapters) {
      try {
        const subject = await ensureSubject(row.subject);
        const chapter = await ensureChapter(subject.id, row.name, row.class ?? null, row.order_index ?? 0);
        if (chapter.created) {
          created++;
          logs.push(`✅ ${subject.name} · ${chapter.name}`);
        } else {
          skipped++;
          logs.push(`↷ Exists: ${subject.name} · ${chapter.name}`);
        }
      } catch (e) {
        logs.push(`❌ ${row.subject} · ${row.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await logAdminAction(context.userId, "chapter_import", null, { created, skipped, total: data.chapters.length });
    return { created, skipped, logs };
  });