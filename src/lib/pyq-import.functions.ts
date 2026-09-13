import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, cleanQuestion, ensureChapter, ensureSubject, insertQuestions } from "./admin-content.server";

const PyqQ = z.object({
  text: z.string().min(5),
  options: z.array(z.string()).length(4),
  correct_index: z.number().int().min(0).max(3),
  subject: z.string().optional(),
  chapter: z.string().optional(),
  year: z.number().int().optional(),
  pyq_year: z.number().int().optional(),
  difficulty: z.string().optional(),
  explanation: z.string().optional(),
  marks_correct: z.number().optional(),
  marks_wrong: z.number().optional(),
});

export const importPyqQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ questions: z.array(PyqQ).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const q of data.questions) {
      let subjectId: string | null = null;
      let chapterId: string | null = null;
      if (q.subject) {
        const subject = await ensureSubject(q.subject);
        subjectId = subject.id;
        if (q.chapter) chapterId = (await ensureChapter(subjectId!, q.chapter)).id;
      }
      const year = q.pyq_year ?? q.year ?? null;
      const row = cleanQuestion({
        ...q,
        source: "PYQ",
        is_pyq: true,
        pyq_year: year,
      }, subjectId, chapterId);
      const result = await insertQuestions([row]);
      inserted += result.ids.length;
      if (!result.ids.length) skipped++;
      errors.push(...result.errors);
    }
    await supabaseAdmin.from("admin_actions").insert({
      user_id: context.userId,
      action: "pyq_import",
      target: null,
      meta: { inserted, skipped, errors: errors.slice(0, 5) } as never,
    });
    return { inserted, skipped, errors };
  });
