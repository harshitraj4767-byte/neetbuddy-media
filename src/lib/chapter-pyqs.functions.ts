import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Chapter-wise PYQs, MySQL edition.
//
// The page used to call the legacy PHP endpoint (/api/pyqs.php?action=...),
// which never executes on the Node/Nitro deployment, so the chapter list was
// always empty. These server functions run the same SQL directly.
// ---------------------------------------------------------------------------

export type PyqChapterDTO = {
  id: string;
  name: string;
  subject_id: string | null;
  subject_name: string | null;
  pyq_count: number;
};

/** True when MySQL complains about a column the older schema does not have. */
function isUnknownColumn(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /Unknown column/i.test(msg);
}

/** Chapters with their PYQ counts, grouped by subject. */
export const listPyqChapters = createServerFn({ method: "GET" }).handler(
  async (): Promise<PyqChapterDTO[]> => {
    const { query } = await import("@/lib/db/mysql.server");

    const sql = (pyqYear: boolean) => `
      SELECT CAST(c.id AS CHAR) AS id,
             c.name,
             CAST(c.subject_id AS CHAR) AS subject_id,
             s.name AS subject_name,
             (SELECT COUNT(*) FROM qb_questions q
               WHERE q.chapter_id = c.id
                 AND (q.year IS NOT NULL${pyqYear ? " OR q.pyq_year IS NOT NULL" : ""})) AS pyq_count
        FROM qb_chapters c
        LEFT JOIN qb_subjects s ON s.id = c.subject_id
       ORDER BY s.name ASC, c.name ASC`;

    let rows: Record<string, unknown>[];
    try {
      rows = await query<Record<string, unknown>>(sql(true));
    } catch (error) {
      if (!isUnknownColumn(error)) throw error;
      rows = await query<Record<string, unknown>>(sql(false));
    }

    return rows
      .map((r) => ({
        id: String(r["id"]),
        name: String(r["name"] ?? "Chapter"),
        subject_id: r["subject_id"] == null ? null : String(r["subject_id"]),
        subject_name: (r["subject_name"] as string | null) ?? null,
        pyq_count: Number(r["pyq_count"] ?? 0),
      }))
      .filter((c) => c.pyq_count > 0);
  },
);

/** Reuse this chapter's PYQ practice test, creating it on first request. */
export const getOrCreateChapterPyqTest = createServerFn({ method: "POST" })
  .validator((d: { chapterId: string }) => d)
  .handler(async ({ data }): Promise<{ testId: string; totalQuestions: number }> => {
    const chapterId = String(data.chapterId ?? "").trim();
    if (!chapterId) throw new Error("chapterId required");

    const { query, queryOne, execute } = await import("@/lib/db/mysql.server");

    const chapter = await queryOne<{ name: string | null }>(
      "SELECT name FROM qb_chapters WHERE CAST(id AS CHAR) = ? LIMIT 1",
      [chapterId],
    );
    const chapterName = chapter?.name ?? "Chapter";
    const title = `${chapterName} PYQ Practice`;

    const existing = await queryOne<{ id: string; total_questions: unknown }>(
      "SELECT CAST(id AS CHAR) AS id, total_questions FROM tests WHERE title = ? AND type = 'practice' LIMIT 1",
      [title],
    );
    if (existing) {
      return { testId: String(existing.id), totalQuestions: Number(existing.total_questions ?? 0) };
    }

    const pyqSql = (pyqYear: boolean) => `
      SELECT CAST(id AS CHAR) AS id FROM qb_questions
       WHERE chapter_id = ?
         AND (year IS NOT NULL${pyqYear ? " OR pyq_year IS NOT NULL" : ""})
       ORDER BY year DESC, id ASC LIMIT 100`;

    let rows: { id: string }[];
    try {
      rows = await query<{ id: string }>(pyqSql(true), [chapterId]);
    } catch (error) {
      if (!isUnknownColumn(error)) throw error;
      rows = await query<{ id: string }>(pyqSql(false), [chapterId]);
    }

    if (rows.length === 0) {
      rows = await query<{ id: string }>(
        "SELECT CAST(id AS CHAR) AS id FROM qb_questions WHERE chapter_id = ? LIMIT 50",
        [chapterId],
      );
    }
    if (rows.length === 0) throw new Error("No questions available for this chapter yet");

    const questionIds = rows.map((r) => String(r.id));
    const testId = crypto.randomUUID();

    await execute(
      `INSERT INTO tests
         (id, title, description, difficulty, duration_min, total_questions,
          marks_correct, marks_wrong, source, type, question_ids, created_at)
       VALUES (?, ?, ?, 'medium', ?, ?, 4, -1, 'Chapter PYQ', 'practice', CAST(? AS JSON), NOW())`,
      [
        testId,
        title,
        `Previous Year Questions practice for ${chapterName}`,
        Math.max(15, questionIds.length * 2),
        questionIds.length,
        JSON.stringify(questionIds),
      ],
    );

    return { testId, totalQuestions: questionIds.length };
  });
