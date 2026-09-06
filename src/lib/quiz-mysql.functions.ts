import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ---------------------------------------------------------------------------
// Quiz data access, MySQL edition.
//
// Replaces the quiz page's Supabase reads/writes. Question bank lives in
// qb_questions / qb_subjects / qb_chapters; tests.question_ids is a JSON array.
// ---------------------------------------------------------------------------

const COOKIE = "nb_session";

export type QuizOptionDTO = { index: number; html: string };

export type QuizQuestionDTO = {
  id: string;
  questionHtml: string;
  options: QuizOptionDTO[];
  correctIndex: number;
  explanation: string | null;
  explanationImageUrl: string | null;
  questionImageUrl: string | null;
  difficulty: string;
  qtype: string;
  year: number | null;
  tag: string | null;
  isPyq: boolean;
  subjectId: string | null;
  subjectName: string | null;
  chapterId: string | null;
  chapterName: string | null;
  diagramIds: string[];
};

export type QuizTestDTO = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  difficulty: string;
  durationMin: number;
  totalQuestions: number;
  marksCorrect: number;
  marksWrong: number;
  source: string;
  isPaid: boolean;
  startsAt: string | null;
  endsAt: string | null;
  questionIds: string[];
};

export type QuizAttemptDTO = {
  id: string;
  testId: string;
  answers: Record<string, number>;
  bookmarks: string[];
  status: string;
  score: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unattemptedCount: number | null;
  timeTakenSec: number | null;
  startedAt: string | null;
  submittedAt: string | null;
};

// ---------- helpers (server-only) ----------

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function readCookie(name: string): string | null {
  const raw = getRequestHeader("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Resolve the signed-in user from the MySQL session cookie. */
async function getUserId(): Promise<string | null> {
  const token = readCookie(COOKIE);
  if (!token) return null;
  const { queryOne } = await import("@/lib/db/mysql.server");
  const row = await queryOne<{ user_id: string }>(
    `SELECT s.user_id
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.suspended = 0
      LIMIT 1`,
    [await sha256(token)],
  );
  return row?.user_id ?? null;
}

async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error("Not signed in");
  return id;
}

/** MySQL JSON columns come back either parsed or as a string, depending on driver mode. */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function normalizeOptions(raw: unknown): QuizOptionDTO[] {
  const parsed = parseJson<unknown>(raw, []);
  if (Array.isArray(parsed)) {
    return parsed.map((o, index) => ({
      index,
      html: typeof o === "string" ? o : String((o as { html?: unknown })?.html ?? ""),
    }));
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>).map(([k, v], index) => ({
      index: Number.isNaN(Number(k)) ? index : Number(k),
      html: typeof v === "string" ? v : String((v as { html?: unknown })?.html ?? ""),
    }));
  }
  return [];
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapAttempt(row: Record<string, unknown>): QuizAttemptDTO {
  return {
    id: String(row["id"]),
    testId: String(row["test_id"]),
    answers: parseJson<Record<string, number>>(row["answers"], {}),
    bookmarks: parseJson<string[]>(row["bookmarks"], []),
    status: String(row["status"] ?? "in_progress"),
    score: row["score"] == null ? null : Number(row["score"]),
    correctCount: row["correct_count"] == null ? null : Number(row["correct_count"]),
    wrongCount: row["wrong_count"] == null ? null : Number(row["wrong_count"]),
    unattemptedCount:
      row["unattempted_count"] == null ? null : Number(row["unattempted_count"]),
    timeTakenSec: row["time_taken_sec"] == null ? null : Number(row["time_taken_sec"]),
    startedAt: toIsoOrNull(row["started_at"]),
    submittedAt: toIsoOrNull(row["submitted_at"]),
  };
}

// ---------- server functions ----------

/** Load one test row; question_ids is stored as a JSON array. */
export const getQuizTest = createServerFn({ method: "GET" })
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data }): Promise<QuizTestDTO | null> => {
    const { queryOne } = await import("@/lib/db/mysql.server");
    const row = await queryOne<Record<string, unknown>>(
      "SELECT * FROM tests WHERE id = ? LIMIT 1",
      [data.testId],
    );
    if (!row) return null;
    const ids = parseJson<unknown>(row["question_ids"], []);
    return {
      id: String(row["id"]),
      title: String(row["title"] ?? ""),
      description: (row["description"] as string | null) ?? null,
      type: String(row["type"] ?? "quiz"),
      difficulty: String(row["difficulty"] ?? "medium"),
      durationMin: Number(row["duration_min"] ?? 30),
      totalQuestions: Number(row["total_questions"] ?? 0),
      marksCorrect: Number(row["marks_correct"] ?? 4),
      marksWrong: Number(row["marks_wrong"] ?? -1),
      source: String(row["source"] ?? "NCERT"),
      isPaid: Number(row["is_paid"] ?? 0) === 1,
      startsAt: toIsoOrNull(row["starts_at"]),
      endsAt: toIsoOrNull(row["ends_at"]),
      questionIds: Array.isArray(ids) ? ids.map((v) => String(v)) : [],
    };
  });

/**
 * Load the test's questions from the question bank, joined to subject/chapter
 * names, with diagram ids attached. Returned in the order of `questionIds`.
 */
export const getQuizQuestions = createServerFn({ method: "POST" })
  .inputValidator((d: { questionIds: string[] }) => d)
  .handler(async ({ data }): Promise<QuizQuestionDTO[]> => {
    const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
    if (ids.length === 0) return [];
    const { query } = await import("@/lib/db/mysql.server");

    const rows = await query<Record<string, unknown>>(
      `SELECT q.*, s.name AS subject_name, c.name AS chapter_name
         FROM qb_questions q
         LEFT JOIN qb_subjects s ON s.id = q.subject_id
         LEFT JOIN qb_chapters c ON c.id = q.chapter_id
        WHERE CAST(q.id AS CHAR) IN (${placeholders(ids.length)})`,
      ids,
    );

    const diagrams = await query<{ id: string; question_id: string }>(
      `SELECT id, CAST(question_id AS CHAR) AS question_id
         FROM question_diagrams
        WHERE CAST(question_id AS CHAR) IN (${placeholders(ids.length)})`,
      ids,
    );
    const diagramsByQuestion = new Map<string, string[]>();
    for (const d of diagrams) {
      const key = String(d.question_id);
      const list = diagramsByQuestion.get(key) ?? [];
      list.push(String(d.id));
      diagramsByQuestion.set(key, list);
    }

    const byId = new Map<string, QuizQuestionDTO>();
    for (const row of rows) {
      const id = String(row["id"]);
      byId.set(id, {
        id,
        questionHtml: String(row["question_html"] ?? ""),
        options: normalizeOptions(row["options"]),
        correctIndex: Number(row["correct_index"] ?? 0),
        explanation: (row["explanation"] as string | null) ?? null,
        explanationImageUrl: (row["explanation_image_url"] as string | null) ?? null,
        questionImageUrl: (row["question_image_url"] as string | null) ?? null,
        difficulty: String(row["difficulty"] ?? "Medium"),
        qtype: String(row["qtype"] ?? "MCQ"),
        year: row["year"] == null ? null : Number(row["year"]),
        tag: (row["tag"] as string | null) ?? null,
        isPyq: Number(row["is_pyq"] ?? 0) === 1,
        subjectId: row["subject_id"] == null ? null : String(row["subject_id"]),
        subjectName: (row["subject_name"] as string | null) ?? null,
        chapterId: row["chapter_id"] == null ? null : String(row["chapter_id"]),
        chapterName: (row["chapter_name"] as string | null) ?? null,
        diagramIds: diagramsByQuestion.get(id) ?? [],
      });
    }

    // Preserve the test's declared question order.
    return data.questionIds
      .map((id) => byId.get(String(id)))
      .filter((q): q is QuizQuestionDTO => Boolean(q));
  });

/** Which of these questions the current user has bookmarked. */
export const getQuizBookmarks = createServerFn({ method: "POST" })
  .inputValidator((d: { questionIds: string[] }) => d)
  .handler(async ({ data }): Promise<string[]> => {
    const userId = await getUserId();
    const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
    if (!userId || ids.length === 0) return [];
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<{ question_id: string }>(
      `SELECT question_id FROM bookmarks
        WHERE user_id = ? AND question_id IN (${placeholders(ids.length)})`,
      [userId, ...ids],
    );
    return rows.map((r) => String(r.question_id));
  });

/** Add or remove a bookmark; returns the resulting state. */
export const toggleQuizBookmark = createServerFn({ method: "POST" })
  .inputValidator((d: { questionId: string }) => d)
  .handler(async ({ data }): Promise<{ bookmarked: boolean }> => {
    const userId = await requireUserId();
    const { queryOne, execute } = await import("@/lib/db/mysql.server");
    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM bookmarks WHERE user_id = ? AND question_id = ? LIMIT 1",
      [userId, data.questionId],
    );
    if (existing) {
      await execute("DELETE FROM bookmarks WHERE id = ?", [existing.id]);
      return { bookmarked: false };
    }
    await execute(
      "INSERT INTO bookmarks (id, user_id, question_id, created_at) VALUES (UUID(), ?, ?, NOW(6))",
      [userId, data.questionId],
    );
    return { bookmarked: true };
  });

/** Latest attempt for this user + test, if any. */
export const getQuizAttempt = createServerFn({ method: "POST" })
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data }): Promise<QuizAttemptDTO | null> => {
    const userId = await getUserId();
    if (!userId) return null;
    const { queryOne } = await import("@/lib/db/mysql.server");
    const row = await queryOne<Record<string, unknown>>(
      `SELECT * FROM attempts
        WHERE user_id = ? AND test_id = ?
        ORDER BY started_at DESC LIMIT 1`,
      [userId, data.testId],
    );
    return row ? mapAttempt(row) : null;
  });

/** How many times this user already attempted this test. */
export const getQuizAttemptCount = createServerFn({ method: "POST" })
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data }): Promise<number> => {
    const userId = await getUserId();
    if (!userId) return 0;
    const { queryOne } = await import("@/lib/db/mysql.server");
    const row = await queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM attempts WHERE user_id = ? AND test_id = ?",
      [userId, data.testId],
    );
    return Number(row?.c ?? 0);
  });

/** Create or update the in-progress attempt (autosave). Returns its id. */
export const saveQuizProgress = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      testId: string;
      attemptId?: string | null;
      answers: Record<string, number>;
      bookmarks: string[];
    }) => d,
  )
  .handler(async ({ data }): Promise<{ attemptId: string }> => {
    const userId = await requireUserId();
    const { execute, queryOne } = await import("@/lib/db/mysql.server");
    const answers = JSON.stringify(data.answers ?? {});
    const bookmarks = JSON.stringify(data.bookmarks ?? []);

    if (data.attemptId) {
      await execute(
        `UPDATE attempts SET answers = CAST(? AS JSON), bookmarks = CAST(? AS JSON)
          WHERE id = ? AND user_id = ?`,
        [answers, bookmarks, data.attemptId, userId],
      );
      return { attemptId: data.attemptId };
    }

    const open = await queryOne<{ id: string }>(
      `SELECT id FROM attempts
        WHERE user_id = ? AND test_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC LIMIT 1`,
      [userId, data.testId],
    );
    if (open) {
      await execute(
        `UPDATE attempts SET answers = CAST(? AS JSON), bookmarks = CAST(? AS JSON) WHERE id = ?`,
        [answers, bookmarks, open.id],
      );
      return { attemptId: open.id };
    }

    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO attempts
         (id, user_id, test_id, answers, bookmarks, status, started_at)
       VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 'in_progress', NOW(6))`,
      [id, userId, data.testId, answers, bookmarks],
    );
    return { attemptId: id };
  });

/**
 * Finalize an attempt. Scoring is done by the caller (identical to the old
 * client logic); this only persists the result and the wrong-question rows.
 */
export const submitQuizAttempt = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      testId: string;
      attemptId?: string | null;
      answers: Record<string, number>;
      bookmarks: string[];
      score: number;
      correctCount: number;
      wrongCount: number;
      unattemptedCount: number;
      timeTakenSec: number;
      wrongQuestions?: { questionId: string; chapterId?: string | null }[];
    }) => d,
  )
  .handler(async ({ data }): Promise<{ attemptId: string }> => {
    const userId = await requireUserId();
    const { execute, queryOne } = await import("@/lib/db/mysql.server");
    const answers = JSON.stringify(data.answers ?? {});
    const bookmarks = JSON.stringify(data.bookmarks ?? []);

    let attemptId = data.attemptId ?? null;
    if (!attemptId) {
      const open = await queryOne<{ id: string }>(
        `SELECT id FROM attempts
          WHERE user_id = ? AND test_id = ? AND status = 'in_progress'
          ORDER BY started_at DESC LIMIT 1`,
        [userId, data.testId],
      );
      attemptId = open?.id ?? null;
    }

    if (attemptId) {
      await execute(
        `UPDATE attempts
            SET answers = CAST(? AS JSON), bookmarks = CAST(? AS JSON), score = ?,
                correct_count = ?, wrong_count = ?, unattempted_count = ?,
                time_taken_sec = ?, status = 'submitted', submitted_at = NOW(6)
          WHERE id = ? AND user_id = ?`,
        [
          answers,
          bookmarks,
          data.score,
          data.correctCount,
          data.wrongCount,
          data.unattemptedCount,
          data.timeTakenSec,
          attemptId,
          userId,
        ],
      );
    } else {
      attemptId = crypto.randomUUID();
      await execute(
        `INSERT INTO attempts
           (id, user_id, test_id, answers, bookmarks, score, correct_count, wrong_count,
            unattempted_count, time_taken_sec, status, started_at, submitted_at)
         VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, ?, 'submitted', NOW(6), NOW(6))`,
        [
          attemptId,
          userId,
          data.testId,
          answers,
          bookmarks,
          data.score,
          data.correctCount,
          data.wrongCount,
          data.unattemptedCount,
          data.timeTakenSec,
        ],
      );
    }

    for (const w of data.wrongQuestions ?? []) {
      await execute(
        `INSERT INTO wrong_questions (id, user_id, question_id, chapter_id, created_at)
         VALUES (UUID(), ?, ?, ?, NOW(6))
         ON DUPLICATE KEY UPDATE created_at = NOW(6)`,
        [userId, w.questionId, w.chapterId ?? null],
      );
    }

    return { attemptId };
  });

/** Questions this user previously got wrong (used for the "seen before" hint). */
export const getWrongQuestionIds = createServerFn({ method: "POST" })
  .inputValidator((d: { questionIds: string[] }) => d)
  .handler(async ({ data }): Promise<string[]> => {
    const userId = await getUserId();
    const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
    if (!userId || ids.length === 0) return [];
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<{ question_id: string }>(
      `SELECT question_id FROM wrong_questions
        WHERE user_id = ? AND question_id IN (${placeholders(ids.length)})`,
      [userId, ...ids],
    );
    return rows.map((r) => String(r.question_id));
  });
