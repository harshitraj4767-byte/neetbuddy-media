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
    return parsed.map((o, index) => {
      let val = "";
      if (typeof o === "string") val = o;
      else if (o && typeof o === "object") {
        const obj = o as Record<string, unknown>;
        val = String(obj["text"] ?? obj["html"] ?? obj["value"] ?? "");
      }
      return { index, html: val };
    });
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed as Record<string, unknown>).map(([k, v], index) => {
      let val = "";
      if (typeof v === "string") val = v;
      else if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        val = String(obj["text"] ?? obj["html"] ?? obj["value"] ?? "");
      }
      return {
        index: Number.isNaN(Number(k)) ? index : Number(k),
        html: val,
      };
    });
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
  .validator((d: { testId: string }) => d)
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
  .validator((d: { questionIds: string[] }) => d)
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
  .validator((d: { questionIds: string[] }) => d)
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

export type BookmarkListItemDTO = {
  id: string;
  questionId: string;
  questionHtml: string;
  options: QuizOptionDTO[];
  difficulty: string;
  subjectName: string | null;
  chapterName: string | null;
  createdAt: string | null;
};

/**
 * Every bookmark of the current user, newest first, joined to the question
 * bank. Ids are compared as CHAR because bookmarks.question_id is text while
 * qb_questions.id may be numeric.
 */
export const listUserBookmarks = createServerFn({ method: "POST" })
  .handler(async (): Promise<BookmarkListItemDTO[]> => {
    const userId = await getUserId();
    if (!userId) return [];
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<Record<string, unknown>>(
      `SELECT b.id, CAST(b.question_id AS CHAR) AS question_id, b.created_at,
              q.question_html, q.options, q.difficulty,
              s.name AS subject_name, c.name AS chapter_name
         FROM bookmarks b
         JOIN qb_questions q ON CAST(q.id AS CHAR) = CAST(b.question_id AS CHAR)
         LEFT JOIN qb_subjects s ON s.id = q.subject_id
         LEFT JOIN qb_chapters c ON c.id = q.chapter_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row["id"]),
      questionId: String(row["question_id"]),
      questionHtml: String(row["question_html"] ?? ""),
      options: normalizeOptions(row["options"]),
      difficulty: String(row["difficulty"] ?? "Medium"),
      subjectName: (row["subject_name"] as string | null) ?? null,
      chapterName: (row["chapter_name"] as string | null) ?? null,
      createdAt: toIsoOrNull(row["created_at"]),
    }));
  });

/** Add or remove a bookmark; returns the resulting state. */
export const toggleQuizBookmark = createServerFn({ method: "POST" })
  .validator((d: { questionId: string }) => d)
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
  .validator((d: { testId: string }) => d)
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
  .validator((d: { testId: string }) => d)
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
  .validator(
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
        `UPDATE attempts SET answers = ?, bookmarks = ?
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
        `UPDATE attempts SET answers = ?, bookmarks = ? WHERE id = ?`,
        [answers, bookmarks, open.id],
      );
      return { attemptId: open.id };
    }

    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO attempts
         (id, user_id, test_id, answers, bookmarks, status, started_at)
       VALUES (?, ?, ?, ?, ?, 'in_progress', NOW(6))`,
      [id, userId, data.testId, answers, bookmarks],
    );
    return { attemptId: id };
  });

/**
 * Finalize an attempt. Scoring is done by the caller (identical to the old
 * client logic); this only persists the result and the wrong-question rows.
 */
export const submitQuizAttempt = createServerFn({ method: "POST" })
  .validator(
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
            SET answers = ?, bookmarks = ?, score = ?,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', NOW(6), NOW(6))`,
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
  .validator((d: { questionIds: string[] }) => d)
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

// ---------------------------------------------------------------------------
// Page-shaped helpers for src/routes/quiz.$testId.tsx
//
// These return rows in the exact snake_case shape the quiz player already
// consumes, so the UI, timer and scoring maths stay untouched.
// ---------------------------------------------------------------------------

export type QuizTestRow = {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  duration_min: number;
  total_questions: number;
  source: string;
  question_ids: string[];
  marks_correct: number;
  marks_wrong: number;
};

export type QuizQuestionRow = {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  difficulty: string;
  source: string;
  marks_correct: number;
  marks_wrong: number;
  explanation: string | null;
  question_image_url: string | null;
  explanation_image_url: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  tag: string | null;
  year: number | null;
  is_pyq: boolean | null;
};

/** tests row for the quiz player (question_ids is a JSON array). */
export const getQuizPageTest = createServerFn({ method: "POST" })
  .validator((d: { testId: string }) => d)
  .handler(async ({ data }): Promise<QuizTestRow | null> => {
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
      type: String(row["type"] ?? "quiz"),
      difficulty: String(row["difficulty"] ?? "medium"),
      duration_min: Number(row["duration_min"] ?? 30),
      total_questions: Number(row["total_questions"] ?? 0),
      source: String(row["source"] ?? "NCERT"),
      question_ids: Array.isArray(ids) ? ids.map((v) => String(v)) : [],
      marks_correct: Number(row["marks_correct"] ?? 4),
      marks_wrong: Number(row["marks_wrong"] ?? -1),
    };
  });

/** Contest one-shot guard: a completed attempt plus the owning contest id. */
export const getContestPriorAttempt = createServerFn({ method: "POST" })
  .validator((d: { testId: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{ id: string; score: number | null; contestId: string | null } | null> => {
      const userId = await getUserId();
      if (!userId) return null;
      const { queryOne } = await import("@/lib/db/mysql.server");
      const prior = await queryOne<{ id: string; score: unknown }>(
        `SELECT id, score FROM attempts
          WHERE user_id = ? AND test_id = ? AND status = 'completed'
          ORDER BY submitted_at DESC LIMIT 1`,
        [userId, data.testId],
      );
      if (!prior) return null;
      const contest = await queryOne<{ id: string }>(
        "SELECT id FROM contests WHERE test_id = ? LIMIT 1",
        [data.testId],
      );
      return {
        id: String(prior.id),
        score: prior.score == null ? null : Number(prior.score),
        contestId: contest?.id ? String(contest.id) : null,
      };
    },
  );

/** Active battle match for this test, and whether the current user is in it. */
export const getActiveBattleMatch = createServerFn({ method: "POST" })
  .validator((d: { testId: string }) => d)
  .handler(async ({ data }): Promise<{ id: string; joined: boolean } | null> => {
    const userId = await getUserId();
    if (!userId) return null;
    const { queryOne } = await import("@/lib/db/mysql.server");
    const match = await queryOne<{ id: string }>(
      `SELECT id FROM battle_matches
        WHERE test_id = ? AND status = 'active'
        ORDER BY started_at DESC LIMIT 1`,
      [data.testId],
    );
    if (!match) return null;
    const player = await queryOne<{ user_id: string }>(
      "SELECT user_id FROM battle_match_players WHERE match_id = ? AND user_id = ? LIMIT 1",
      [match.id, userId],
    );
    return { id: String(match.id), joined: Boolean(player) };
  });

/** Report the player's battle score (winner resolution stays with the finalizer). */
export const submitBattleScore = createServerFn({ method: "POST" })
  .validator((d: { matchId: string; score: number }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const userId = await requireUserId();
    const { execute } = await import("@/lib/db/mysql.server");
    await execute(
      `UPDATE battle_match_players
          SET score = ?, submitted_at = NOW(6)
        WHERE match_id = ? AND user_id = ?`,
      [data.score, data.matchId, userId],
    );
    return { ok: true };
  });

/** Questions + subject/chapter names + diagram / option-image ids for a test. */
export const getQuizPageQuestions = createServerFn({ method: "POST" })
  .validator((d: { questionIds: string[]; marksCorrect: number; marksWrong: number }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      questions: QuizQuestionRow[];
      subjects: Record<string, string>;
      chapters: Record<string, string>;
      diagrams: Record<string, string[]>;
      optionImages: Record<string, number[]>;
    }> => {
      const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
      if (ids.length === 0) {
        return { questions: [], subjects: {}, chapters: {}, diagrams: {}, optionImages: {} };
      }
      const { query } = await import("@/lib/db/mysql.server");
      const ph = placeholders(ids.length);

      const rows = await query<Record<string, unknown>>(
        `SELECT q.*, s.name AS subject_name, c.name AS chapter_name
           FROM qb_questions q
           LEFT JOIN qb_subjects s ON CAST(s.id AS CHAR) = CAST(q.subject_id AS CHAR)
           LEFT JOIN qb_chapters c ON CAST(c.id AS CHAR) = CAST(q.chapter_id AS CHAR)
          WHERE CAST(q.id AS CHAR) IN (${ph})`,
        ids,
      );

      const [diagRows, optRows] = await Promise.all([
        query<{ id: string; question_id: string }>(
          `SELECT id, CAST(question_id AS CHAR) AS question_id FROM question_diagrams
            WHERE CAST(question_id AS CHAR) IN (${ph})`,
          ids,
        ),
        query<{ question_id: string; option_index: number }>(
          `SELECT CAST(question_id AS CHAR) AS question_id, option_index FROM question_option_images
            WHERE CAST(question_id AS CHAR) IN (${ph})`,
          ids,
        ),
      ]);

      const subjects: Record<string, string> = {};
      const chapters: Record<string, string> = {};
      const questions: QuizQuestionRow[] = [];
      for (const row of rows) {
        const subjectId = row["subject_id"] == null ? null : String(row["subject_id"]);
        const chapterId = row["chapter_id"] == null ? null : String(row["chapter_id"]);
        if (subjectId && row["subject_name"]) subjects[subjectId] = String(row["subject_name"]);
        if (chapterId && row["chapter_name"]) chapters[chapterId] = String(row["chapter_name"]);
        questions.push({
          id: String(row["id"]),
          text: String(row["question_html"] ?? ""),
          options: normalizeOptions(row["options"]).map((o) => o.html),
          correct_index: Number(row["correct_index"] ?? 0),
          difficulty: String(row["difficulty"] ?? "Medium"),
          source: String(row["qtype"] ?? "MCQ"),
          marks_correct: Number(data.marksCorrect) || 4,
          marks_wrong: Number(data.marksWrong ?? -1),
          explanation: (row["explanation"] as string | null) ?? null,
          question_image_url: (row["question_image_url"] as string | null) ?? null,
          explanation_image_url: (row["explanation_image_url"] as string | null) ?? null,
          subject_id: subjectId,
          chapter_id: chapterId,
          tag: (row["tag"] as string | null) ?? null,
          year: row["year"] == null ? null : Number(row["year"]),
          is_pyq: Number(row["is_pyq"] ?? 0) === 1,
        });
      }

      const diagrams: Record<string, string[]> = {};
      for (const d of diagRows) {
        const key = String(d.question_id);
        (diagrams[key] ??= []).push(String(d.id));
      }
      const optionImages: Record<string, number[]> = {};
      for (const o of optRows) {
        const key = String(o.question_id);
        (optionImages[key] ??= []).push(Number(o.option_index));
      }

      return { questions, subjects, chapters, diagrams, optionImages };
    },
  );

/** Bookmarked + previously-wrong question ids for the current user. */
export const getQuizUserMarks = createServerFn({ method: "POST" })
  .validator((d: { questionIds: string[] }) => d)
  .handler(async ({ data }): Promise<{ bookmarks: string[]; wrong: string[] }> => {
    const userId = await getUserId();
    const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
    if (!userId || ids.length === 0) return { bookmarks: [], wrong: [] };
    const { query } = await import("@/lib/db/mysql.server");
    const ph = placeholders(ids.length);
    const [bm, wq] = await Promise.all([
      query<{ question_id: string }>(
        `SELECT question_id FROM bookmarks WHERE user_id = ? AND question_id IN (${ph})`,
        [userId, ...ids],
      ),
      query<{ question_id: string }>(
        `SELECT question_id FROM wrong_questions WHERE user_id = ? AND question_id IN (${ph})`,
        [userId, ...ids],
      ),
    ]);
    return {
      bookmarks: bm.map((r) => String(r.question_id)),
      wrong: wq.map((r) => String(r.question_id)),
    };
  });

/** Most recent attempt row (any status) for resuming practice quizzes. */
export const getLatestQuizAttempt = createServerFn({ method: "POST" })
  .validator((d: { testId: string }) => d)
  .handler(
    async ({
      data,
    }): Promise<{
      id: string;
      answers: Record<string, number>;
      bookmarks: string[];
      status: string;
    } | null> => {
      const userId = await getUserId();
      if (!userId) return null;
      const { queryOne } = await import("@/lib/db/mysql.server");
      const row = await queryOne<Record<string, unknown>>(
        `SELECT id, answers, bookmarks, status FROM attempts
          WHERE user_id = ? AND test_id = ?
          ORDER BY started_at DESC LIMIT 1`,
        [userId, data.testId],
      );
      if (!row) return null;
      return {
        id: String(row["id"]),
        answers: parseJson<Record<string, number>>(row["answers"], {}),
        bookmarks: parseJson<string[]>(row["bookmarks"], []),
        status: String(row["status"] ?? "in_progress"),
      };
    },
  );

/** Add or remove a bookmark explicitly (mirrors the old upsert/delete pair). */
export const setQuizBookmark = createServerFn({ method: "POST" })
  .validator((d: { questionId: string; add: boolean }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const userId = await requireUserId();
    const { execute } = await import("@/lib/db/mysql.server");
    if (data.add) {
      await execute(
        `INSERT INTO bookmarks (id, user_id, question_id, created_at)
         VALUES (UUID(), ?, ?, NOW(6))
         ON DUPLICATE KEY UPDATE created_at = created_at`,
        [userId, data.questionId],
      );
    } else {
      await execute("DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?", [
        userId,
        data.questionId,
      ]);
    }
    return { ok: true };
  });

/** Add or remove a "My Mistakes" / wrong-question row. */
export const setQuizWrongQuestion = createServerFn({ method: "POST" })
  .validator((d: { questionId: string; chapterId?: string | null; add: boolean }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const userId = await requireUserId();
    const { execute } = await import("@/lib/db/mysql.server");
    if (data.add) {
      await execute(
        `INSERT INTO wrong_questions (id, user_id, question_id, chapter_id, created_at)
         VALUES (UUID(), ?, ?, ?, NOW(6))
         ON DUPLICATE KEY UPDATE chapter_id = VALUES(chapter_id), created_at = NOW(6)`,
        [userId, data.questionId, data.chapterId ?? null],
      );
    } else {
      await execute("DELETE FROM wrong_questions WHERE user_id = ? AND question_id = ?", [
        userId,
        data.questionId,
      ]);
    }
    return { ok: true };
  });

/**
 * Persist a completed attempt exactly like the old Supabase insert did: a new
 * `completed` row, the wrong-question rows, the prior-attempt count, and the XP
 * award that used to run in the `award_attempt_xp` SECURITY DEFINER function
 * (+4 per correct, -1 per wrong, never below zero).
 */
export const submitQuizPageAttempt = createServerFn({ method: "POST" })
  .validator(
    (d: {
      testId: string;
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
  .handler(async ({ data }): Promise<{ attemptId: string; priorCount: number }> => {
    const userId = await requireUserId();
    const { execute, queryOne } = await import("@/lib/db/mysql.server");

    for (const w of data.wrongQuestions ?? []) {
      await execute(
        `INSERT INTO wrong_questions (id, user_id, question_id, chapter_id, created_at)
         VALUES (UUID(), ?, ?, ?, NOW(6))
         ON DUPLICATE KEY UPDATE chapter_id = VALUES(chapter_id), created_at = NOW(6)`,
        [userId, w.questionId, w.chapterId ?? null],
      );
    }

    const attemptId = crypto.randomUUID();
    await execute(
      `INSERT INTO attempts
         (id, user_id, test_id, answers, bookmarks, score, correct_count, wrong_count,
          unattempted_count, time_taken_sec, status, started_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', NOW(6), NOW(6))`,
      [
        attemptId,
        userId,
        data.testId,
        JSON.stringify(data.answers ?? {}),
        JSON.stringify(data.bookmarks ?? []),
        data.score,
        data.correctCount,
        data.wrongCount,
        data.unattemptedCount,
        data.timeTakenSec,
      ],
    );

    const counted = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM attempts
        WHERE user_id = ? AND test_id = ? AND status = 'completed'`,
      [userId, data.testId],
    );

    const xpDelta = data.correctCount * 4 - data.wrongCount;
    await execute(
      "UPDATE profiles SET xp_total = GREATEST(0, xp_total + ?), updated_at = NOW(6) WHERE id = ?",
      [xpDelta, userId],
    );

    return { attemptId, priorCount: Number(counted?.c ?? 0) };
  });

/** Wrong-reason tags recorded against an attempt, used by the result view. */
export const getAttemptWrongReasons = createServerFn({ method: "POST" })
  .validator((d: { attemptId: string }) => d)
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const userId = await getUserId();
    if (!userId) return {};
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<{ question_id: string; wrong_reason: string | null }>(
      `SELECT CAST(aa.question_id AS CHAR) AS question_id, aa.wrong_reason
         FROM attempt_answers aa
         JOIN attempts a ON a.id = aa.attempt_id
        WHERE aa.attempt_id = ? AND a.user_id = ?`,
      [data.attemptId, userId],
    );
    const out: Record<string, string> = {};
    for (const r of rows) if (r.wrong_reason) out[String(r.question_id)] = r.wrong_reason;
    return out;
  });

// ---------------------------------------------------------------------------
// "My Mistakes" notebook listing (src/routes/mistakes.tsx).
// The page used to fetch /api/mistakes.php, which is never executed by the
// Node server, so the list was always empty. Read from MySQL instead.
// ---------------------------------------------------------------------------

export type MistakeListItemDTO = {
  id: string;
  questionId: string;
  questionHtml: string;
  options: QuizOptionDTO[];
  difficulty: string;
  explanation: string | null;
  correctIndex: number;
  subjectName: string | null;
  chapterName: string | null;
  createdAt: string | null;
};

export const listUserMistakes = createServerFn({ method: "POST" }).handler(
  async (): Promise<MistakeListItemDTO[]> => {
    const userId = await getUserId();
    if (!userId) return [];
    const { query } = await import("@/lib/db/mysql.server");
    const rows = await query<Record<string, unknown>>(
      `SELECT wq.id,
              CAST(wq.question_id AS CHAR) AS question_id,
              wq.created_at,
              q.question_html,
              q.options,
              q.correct_index,
              q.explanation,
              q.difficulty,
              s.name AS subject_name,
              c.name AS chapter_name
         FROM wrong_questions wq
         JOIN qb_questions q ON CAST(q.id AS CHAR) = CAST(wq.question_id AS CHAR)
         LEFT JOIN qb_subjects s ON CAST(s.id AS CHAR) = CAST(q.subject_id AS CHAR)
         LEFT JOIN qb_chapters c ON CAST(c.id AS CHAR) = CAST(COALESCE(wq.chapter_id, q.chapter_id) AS CHAR)
        WHERE CAST(wq.user_id AS CHAR) = ?
        ORDER BY wq.created_at DESC`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row["id"] ?? row["question_id"]),
      questionId: String(row["question_id"]),
      questionHtml: String(row["question_html"] ?? ""),
      options: normalizeOptions(row["options"]),
      difficulty: String(row["difficulty"] ?? "Medium"),
      explanation: (row["explanation"] as string | null) ?? null,
      correctIndex: Number(row["correct_index"] ?? 0),
      subjectName: row["subject_name"] == null ? null : String(row["subject_name"]),
      chapterName: row["chapter_name"] == null ? null : String(row["chapter_name"]),
      createdAt: toIsoOrNull(row["created_at"]),
    }));
  },
);
