// Admin CRUD for the question-bank taxonomy (subjects / chapters).
//
// WHY THIS EXISTS
// ---------------
// `public.subjects`, `public.chapters` and `public.questions` are *compatibility
// VIEWS* over the `qb_*` tables (see supabase/migrations-manual/qb_compat.sql).
// `chapters` LEFT JOINs `qb_chapter_meta` and `questions` has computed columns,
// so Postgres treats both as NOT auto-updatable: every INSERT / UPDATE / DELETE
// the admin panel sent straight at them failed. All taxonomy writes therefore
// go through these server functions, which hit the real `qb_*` tables with the
// service-role client.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logAdminAction } from "./admin-content.server";

/** Chapter ids are bigint in qb_chapters; the client passes them as strings. */
const ChapterId = z.string().min(1).max(32).regex(/^\d+$/, "Invalid chapter id");
const SubjectId = z.string().min(1).max(64);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

export const adminUpsertChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        id: ChapterId.optional(),
        subject_id: SubjectId,
        name: z.string().min(1).max(200),
        class: z.number().int().min(1).max(12).nullable().optional(),
        order_index: z.number().int().min(0).max(9999).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();

    let chapterId = data.id ? Number(data.id) : null;

    if (chapterId == null) {
      // qb_chapters.id has no sequence — derive the next id ourselves.
      const { data: top } = await db
        .from("qb_chapters")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      chapterId = Number(top?.id ?? 0) + 1;
      const { error } = await db
        .from("qb_chapters")
        .insert({ id: chapterId, subject_id: data.subject_id, name: data.name, question_count: 0 });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("qb_chapters")
        .update({ subject_id: data.subject_id, name: data.name })
        .eq("id", chapterId);
      if (error) throw new Error(error.message);
    }

    const { error: metaErr } = await db
      .from("qb_chapter_meta")
      .upsert(
        { chapter_id: chapterId, class: data.class ?? null, order_index: data.order_index },
        { onConflict: "chapter_id" },
      );
    if (metaErr) throw new Error(metaErr.message);

    await logAdminAction(context.userId, data.id ? "chapter_update" : "chapter_create", String(chapterId), {
      name: data.name,
    });
    return { id: String(chapterId) };
  });

export const adminDeleteChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({ id: ChapterId, deleteQuestions: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    const chapterId = Number(data.id);

    const { count } = await db
      .from("qb_questions")
      .select("id", { count: "exact", head: true })
      .eq("chapter_id", chapterId);

    if (data.deleteQuestions) {
      // qb_questions.chapter_id is ON DELETE CASCADE, but delete explicitly so
      // the caller gets an accurate count and no FK surprise from other tables.
      const { error } = await db.from("qb_questions").delete().eq("chapter_id", chapterId);
      if (error) throw new Error(error.message);
    }

    await db.from("qb_chapter_meta").delete().eq("chapter_id", chapterId);
    const { error: chErr } = await db.from("qb_chapters").delete().eq("id", chapterId);
    if (chErr) throw new Error(chErr.message);

    await logAdminAction(context.userId, "chapter_delete", data.id, { questions_deleted: count ?? 0 });
    return { deleted: count ?? 0 };
  });

export const adminDeleteSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: SubjectId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();

    const { count: qCount } = await db
      .from("qb_questions")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", data.id);
    const { data: chapters } = await db.from("qb_chapters").select("id").eq("subject_id", data.id);
    const chapterIds = (chapters ?? []).map((c: { id: number }) => c.id);

    const { error: qErr } = await db.from("qb_questions").delete().eq("subject_id", data.id);
    if (qErr) throw new Error(qErr.message);
    if (chapterIds.length) {
      await db.from("qb_chapter_meta").delete().in("chapter_id", chapterIds);
      const { error: chErr } = await db.from("qb_chapters").delete().eq("subject_id", data.id);
      if (chErr) throw new Error(chErr.message);
    }
    const { error: sErr } = await db.from("qb_subjects").delete().eq("id", data.id);
    if (sErr) throw new Error(sErr.message);

    await logAdminAction(context.userId, "subject_delete", data.id, {
      questions_deleted: qCount ?? 0,
      chapters_deleted: chapterIds.length,
    });
    return { deleted: qCount ?? 0, chaptersDeleted: chapterIds.length };
  });

/** Delete every question in a chapter but keep the chapter itself. */
export const adminDeleteChapterQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ chapterId: ChapterId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    const chapterId = Number(data.chapterId);
    const { count } = await db
      .from("qb_questions")
      .select("id", { count: "exact", head: true })
      .eq("chapter_id", chapterId);
    const { error } = await db.from("qb_questions").delete().eq("chapter_id", chapterId);
    if (error) throw new Error(error.message);
    await db.from("qb_chapters").update({ question_count: 0 }).eq("id", chapterId);
    await logAdminAction(context.userId, "bulk_delete_chapter", data.chapterId, {
      questions_deleted: count ?? 0,
    });
    return { deleted: count ?? 0 };
  });

/** Delete every question in a subject (chapters are kept). */
export const adminDeleteSubjectQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ subjectId: SubjectId }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await admin();
    const { count } = await db
      .from("qb_questions")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", data.subjectId);
    const { error } = await db.from("qb_questions").delete().eq("subject_id", data.subjectId);
    if (error) throw new Error(error.message);
    await db.from("qb_chapters").update({ question_count: 0 }).eq("subject_id", data.subjectId);
    await logAdminAction(context.userId, "bulk_delete_subject", data.subjectId, {
      questions_deleted: count ?? 0,
    });
    return { deleted: count ?? 0 };
  });
