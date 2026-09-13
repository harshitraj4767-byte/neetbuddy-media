import { createServerFn } from "@tanstack/react-start";

export type DashboardTestDTO = {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  duration_min: number;
  total_questions: number;
};

export type DashboardAttemptDTO = {
  submitted_at: string | null;
  score: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  unattempted_count: number | null;
  time_taken_sec: number | null;
};

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Latest daily test for the "Today's DPP" card. */
export const getDashboardDailyTest = createServerFn({ method: "POST" }).handler(
  async (): Promise<DashboardTestDTO | null> => {
    const { queryOne } = await import("@/lib/db/mysql.server");
    return await queryOne<DashboardTestDTO>(
      `SELECT id, title, type, difficulty, duration_min, total_questions
         FROM tests
        WHERE type = 'daily'
        ORDER BY created_at DESC
        LIMIT 1`,
    );
  },
);

/** Question-bank counts per subject name for the Quick Practice tiles. */
export const getDashboardSubjectCounts = createServerFn({ method: "POST" }).handler(
  async (): Promise<Record<string, number>> => {
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<{ name: string | null; c: number | string }>(
      `SELECT s.name AS name, COUNT(q.id) AS c
         FROM qb_subjects s
         LEFT JOIN qb_questions q ON CAST(q.subject_id AS CHAR) = CAST(s.id AS CHAR)
        GROUP BY s.id, s.name`,
    );
    const out: Record<string, number> = {};
    for (const row of rows) {
      if (row.name) out[row.name] = Number(row.c) || 0;
    }
    return out;
  },
);

/** Completed attempts from the last 60 days: streak, today's progress, weekly chart. */
export const getDashboardAttempts = createServerFn({ method: "POST" })
  .validator((d: { userId: string; sinceIso: string }) => d)
  .handler(async ({ data }): Promise<DashboardAttemptDTO[]> => {
    const { query } = await import("@/lib/db/mysql.server");
    const since = new Date(data.sinceIso);
    const rows = await query<Record<string, unknown>>(
      `SELECT submitted_at, score, correct_count, wrong_count, unattempted_count, time_taken_sec
         FROM attempts
        WHERE CAST(user_id AS CHAR) = ?
          AND status = 'completed'
          AND submitted_at >= ?
        ORDER BY submitted_at DESC`,
      [data.userId, since],
    );
    return rows.map((r) => ({
      submitted_at: iso(r["submitted_at"]),
      score: r["score"] == null ? null : Number(r["score"]),
      correct_count: r["correct_count"] == null ? null : Number(r["correct_count"]),
      wrong_count: r["wrong_count"] == null ? null : Number(r["wrong_count"]),
      unattempted_count: r["unattempted_count"] == null ? null : Number(r["unattempted_count"]),
      time_taken_sec: r["time_taken_sec"] == null ? null : Number(r["time_taken_sec"]),
    }));
  });

/** Mistake bank totals for the recommendation cards. */
export const getDashboardMistakes = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data }): Promise<{ mistakes: number; weakChapters: number }> => {
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<{ chapter_id: string | null }>(
      `SELECT chapter_id FROM wrong_questions WHERE CAST(user_id AS CHAR) = ?`,
      [data.userId],
    );
    const chapters = new Set(
      rows.map((r) => r.chapter_id).filter((v): v is string => v != null && v !== ""),
    );
    return { mistakes: rows.length, weakChapters: chapters.size };
  });
