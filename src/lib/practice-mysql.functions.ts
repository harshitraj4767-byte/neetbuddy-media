import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { mixQuestions, type MixableQuestion } from "./question-mix";

// ---------------------------------------------------------------------------
// Subject-wise Quiz + Generate Test data access, MySQL edition.
//
// These replace the dead `/api/quiz.php` / `/api/questions.php` fetches the
// pages used to make (they returned an empty body, so the page died with
// "Unexpected end of JSON input"). Every write stamps created_by from the
// MySQL session, because tests.created_by is NOT NULL and the insert failed
// silently without it — which is why no test id ever came back.
// ---------------------------------------------------------------------------

const COOKIE = "nb_session";
const MAX_POOL = 4000;

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
  if (!id) throw new Error("Please sign in again to start a quiz.");
  return id;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

function numericIds(ids: string[]): number[] {
  return ids.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

const DIFFICULTY_DB_VALUE: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  "very hard": "Very Hard",
};

/** Normalise whatever the UI sent to the exact casing stored in qb_questions. */
function dbDifficulty(value?: string | null): string | null {
  if (!value || value === "any" || value === "mix") return null;
  return DIFFICULTY_DB_VALUE[value.toLowerCase()] ?? value;
}

type Filters = { difficulty?: string | null; qtype?: string | null };

// ---------- reads ----------

/** Chapters of a subject with the question count matching the active filters. */
export const getSubjectChapters = createServerFn({ method: "POST" })
  .validator((d: { subject: string } & Filters) => d)
  .handler(
    async ({
      data,
    }): Promise<Array<{ id: string; name: string; order_index: number; q_count: number }>> => {
      const { query } = await import("@/lib/db/mysql.server");
      const params: Array<string | number> = [];
      let countFilter = "";
      const diff = dbDifficulty(data.difficulty);
      if (diff) {
        countFilter += " AND q.difficulty = ?";
        params.push(diff);
      }
      if (data.qtype && data.qtype !== "any") {
        countFilter += " AND q.qtype = ?";
        params.push(data.qtype);
      }
      const rows = await query<Record<string, unknown>>(
        `SELECT CAST(c.id AS CHAR) AS id, c.name,
                (SELECT COUNT(*) FROM qb_questions q
                  WHERE q.chapter_id = c.id${countFilter}) AS q_count
           FROM qb_chapters c
           JOIN qb_subjects s ON s.id = c.subject_id
          WHERE s.name = ?
          ORDER BY c.name ASC`,
        [...params, data.subject],
      );
      return rows.map((r, i) => ({
        id: String(r["id"]),
        name: String(r["name"] ?? ""),
        order_index: i,
        q_count: Number(r["q_count"] ?? 0),
      }));
    },
  );

/** Subjects + all their chapters, for the Generate Test wizard. */
export const getSubjectTree = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    subjects: Array<{ id: string; name: string }>;
    chapters: Array<{ id: string; name: string; subject_id: string }>;
  }> => {
    const { query } = await import("@/lib/db/mysql.server");
    const subjects = await query<Record<string, unknown>>(
      "SELECT CAST(id AS CHAR) AS id, name FROM qb_subjects ORDER BY name ASC",
    );
    const chapters = await query<Record<string, unknown>>(
      `SELECT CAST(id AS CHAR) AS id, name, CAST(subject_id AS CHAR) AS subject_id
         FROM qb_chapters ORDER BY subject_id, name ASC`,
    );
    return {
      subjects: subjects.map((s) => ({ id: String(s["id"]), name: String(s["name"] ?? "") })),
      chapters: chapters.map((c) => ({
        id: String(c["id"]),
        name: String(c["name"] ?? ""),
        subject_id: String(c["subject_id"]),
      })),
    };
  },
);

/** Topics + subtopics for the given chapters (the picker tree). */
export const getTopicTree = createServerFn({ method: "POST" })
  .validator((d: { chapterIds: string[] }) => d)
  .handler(
    async ({
      data,
    }): Promise<
      Array<{
        chapterId: string;
        topics: Array<{ id: string; name: string; subtopics: Array<{ id: string; name: string }> }>;
      }>
    > => {
      const ids = numericIds(data.chapterIds);
      if (!ids.length) return [];
      const { query } = await import("@/lib/db/mysql.server");
      const topics = await query<Record<string, unknown>>(
        `SELECT CAST(id AS CHAR) AS id, name, CAST(chapter_id AS CHAR) AS chapter_id
           FROM qb_topics WHERE chapter_id IN (${placeholders(ids.length)}) ORDER BY id`,
        ids,
      );
      const topicIds = topics.map((t) => Number(t["id"])).filter((n) => Number.isFinite(n));
      const subtopics = topicIds.length
        ? await query<Record<string, unknown>>(
            `SELECT CAST(id AS CHAR) AS id, name, CAST(topic_id AS CHAR) AS topic_id
               FROM qb_subtopics WHERE topic_id IN (${placeholders(topicIds.length)}) ORDER BY id`,
            topicIds,
          )
        : [];

      const subsByTopic = new Map<string, Array<{ id: string; name: string }>>();
      for (const s of subtopics) {
        const key = String(s["topic_id"]);
        const list = subsByTopic.get(key) ?? [];
        list.push({ id: String(s["id"]), name: String(s["name"] ?? "") });
        subsByTopic.set(key, list);
      }

      return ids.map((chapterId) => ({
        chapterId: String(chapterId),
        topics: topics
          .filter((t) => String(t["chapter_id"]) === String(chapterId))
          .map((t) => ({
            id: String(t["id"]),
            name: String(t["name"] ?? ""),
            subtopics: subsByTopic.get(String(t["id"])) ?? [],
          })),
      }));
    },
  );

/** Every question in a chapter matching the filters, plus the mixer fields. */
export const getChapterQuestionPool = createServerFn({ method: "POST" })
  .validator((d: { chapterId: string; topicIds?: string[]; subtopicIds?: string[] } & Filters) => d)
  .handler(async ({ data }): Promise<MixableQuestion[]> => {
    const chapterId = Number(data.chapterId);
    if (!Number.isFinite(chapterId)) return [];
    const { query } = await import("@/lib/db/mysql.server");

    const params: Array<string | number> = [chapterId];
    let where = "chapter_id = ?";
    const diff = dbDifficulty(data.difficulty);
    if (diff) {
      where += " AND difficulty = ?";
      params.push(diff);
    }
    if (data.qtype && data.qtype !== "any") {
      where += " AND qtype = ?";
      params.push(data.qtype);
    }
    const topicIds = numericIds(data.topicIds ?? []);
    const subtopicIds = numericIds(data.subtopicIds ?? []);
    if (topicIds.length || subtopicIds.length) {
      const parts: string[] = [];
      if (topicIds.length) {
        parts.push(`topic_id IN (${placeholders(topicIds.length)})`);
        params.push(...topicIds);
      }
      if (subtopicIds.length) {
        parts.push(`subtopic_id IN (${placeholders(subtopicIds.length)})`);
        params.push(...subtopicIds);
      }
      where += ` AND (${parts.join(" OR ")})`;
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT CAST(id AS CHAR) AS id, question_html, qtype, question_image_url
         FROM qb_questions WHERE ${where} LIMIT ${MAX_POOL}`,
      params,
    );
    return rows.map((r) => ({
      id: String(r["id"]),
      text: (r["question_html"] as string | null) ?? "",
      qtype: (r["qtype"] as string | null) ?? "MCQ",
      question_image_url: (r["question_image_url"] as string | null) ?? null,
    }));
  });

/** Completed attempts for a batch of CBT set titles, keyed by title. */
export const getPracticeSetStatuses = createServerFn({ method: "POST" })
  .validator((d: { titles: string[] }) => d)
  .handler(
    async ({
      data,
    }): Promise<
      Record<string, { attempt_id: string; score: number | null; correct_count: number | null }>
    > => {
      const userId = await getUserId();
      const titles = data.titles.filter(Boolean);
      if (!userId || !titles.length) return {};
      const { query } = await import("@/lib/db/mysql.server");
      const rows = await query<Record<string, unknown>>(
        `SELECT t.title, CAST(a.id AS CHAR) AS attempt_id, a.score, a.correct_count, a.submitted_at
           FROM tests t
           JOIN attempts a ON a.test_id = t.id
          WHERE t.title IN (${placeholders(titles.length)})
            AND a.user_id = ?
            AND a.status IN ('completed', 'submitted')
          ORDER BY a.submitted_at DESC`,
        [...titles, userId],
      );
      const out: Record<
        string,
        { attempt_id: string; score: number | null; correct_count: number | null }
      > = {};
      for (const r of rows) {
        const title = String(r["title"] ?? "");
        if (out[title]) continue;
        out[title] = {
          attempt_id: String(r["attempt_id"]),
          score: r["score"] == null ? null : Number(r["score"]),
          correct_count: r["correct_count"] == null ? null : Number(r["correct_count"]),
        };
      }
      return out;
    },
  );

// ---------- writes ----------

type TestInsert = {
  title: string;
  type: string;
  difficulty: string;
  durationMin: number;
  questionIds: string[];
};

/** Insert a tests row (or refresh the previous identical one) and return its id. */
async function insertTest(userId: string, test: TestInsert): Promise<string> {
  const { queryOne, execute } = await import("@/lib/db/mysql.server");
  const existing = await queryOne<{ id: string }>(
    `SELECT CAST(id AS CHAR) AS id FROM tests
      WHERE title = ? AND created_by = ? AND type = ?
      ORDER BY created_at DESC LIMIT 1`,
    [test.title, userId, test.type],
  );
  // question_ids is a JSON column — always store a JSON array of STRINGS so the
  // quiz page reads the same shape no matter which flow created the test.
  const ids = JSON.stringify(test.questionIds.map((v) => String(v)));
  if (existing) {
    await execute(
      `UPDATE tests SET question_ids = ?, total_questions = ?, duration_min = ?, difficulty = ?
        WHERE id = ?`,
      [ids, test.questionIds.length, test.durationMin, test.difficulty, existing.id],
    );
    return existing.id;
  }
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO tests
       (id, title, type, difficulty, duration_min, total_questions, question_ids,
        marks_correct, marks_wrong, source, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 4, -1, 'NCERT', ?, NOW())`,
    [
      id,
      test.title,
      test.type,
      test.difficulty,
      test.durationMin,
      test.questionIds.length,
      ids,
      userId,
    ],
  );
  return id;
}

/** Subject-wise Quiz: create (or reuse) a practice test for the picked questions. */
export const createPracticeTest = createServerFn({ method: "POST" })
  .validator(
    (d: {
      title: string;
      questionIds: string[];
      difficulty?: string | null;
      durationMin?: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ testId: string }> => {
    const userId = await requireUserId();
    const ids = [...new Set(data.questionIds.map((v) => String(v)))].filter(Boolean);
    if (!ids.length) throw new Error("No questions match the selected filters.");
    const testId = await insertTest(userId, {
      title: data.title,
      type: "practice",
      difficulty: (data.difficulty ?? "medium").toLowerCase(),
      durationMin: data.durationMin ?? Math.max(5, Math.round(ids.length * 1.2)),
      questionIds: ids,
    });
    return { testId };
  });

/** Generate Test: sample a mixed paper across the chosen chapters / topics. */
export const createCustomTestMysql = createServerFn({ method: "POST" })
  .validator(
    (d: {
      chapterIds: string[];
      topicIds?: string[];
      subtopicIds?: string[];
      subjectName: string;
      count: number;
      difficulty: string;
      durationMin: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ testId: string }> => {
    const userId = await requireUserId();
    const chapterIds = numericIds(data.chapterIds);
    if (!chapterIds.length) throw new Error("Please pick at least one chapter.");
    const count = Math.min(90, Math.max(5, Number(data.count) || 10));
    const { query } = await import("@/lib/db/mysql.server");

    const params: Array<string | number> = [...chapterIds];
    let where = `chapter_id IN (${placeholders(chapterIds.length)})`;
    const diff = dbDifficulty(data.difficulty);
    if (diff) {
      where += " AND difficulty = ?";
      params.push(diff);
    }
    const topicIds = numericIds(data.topicIds ?? []);
    const subtopicIds = numericIds(data.subtopicIds ?? []);
    if (topicIds.length || subtopicIds.length) {
      const parts: string[] = [];
      if (topicIds.length) {
        parts.push(`topic_id IN (${placeholders(topicIds.length)})`);
        params.push(...topicIds);
      }
      if (subtopicIds.length) {
        parts.push(`subtopic_id IN (${placeholders(subtopicIds.length)})`);
        params.push(...subtopicIds);
      }
      where += ` AND (${parts.join(" OR ")})`;
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT CAST(id AS CHAR) AS id, question_html, qtype, question_image_url
         FROM qb_questions WHERE ${where} LIMIT ${MAX_POOL}`,
      params,
    );
    if (!rows.length) {
      throw new Error("No questions match these filters — try fewer filters or more chapters.");
    }

    const seen = new Set<string>();
    const pool: MixableQuestion[] = [];
    for (const r of rows) {
      const id = String(r["id"]);
      if (seen.has(id)) continue;
      seen.add(id);
      pool.push({
        id,
        text: (r["question_html"] as string | null) ?? "",
        qtype: (r["qtype"] as string | null) ?? "MCQ",
        question_image_url: (r["question_image_url"] as string | null) ?? null,
      });
    }

    const ids = mixQuestions(pool, `${userId}:${Date.now()}`)
      .slice(0, count)
      .map((q) => q.id);

    const testId = await insertTest(userId, {
      title: `${data.subjectName} Custom Test`,
      type: "custom",
      difficulty: (data.difficulty || "mix").toLowerCase(),
      durationMin: Number(data.durationMin) || 15,
      questionIds: ids,
    });
    return { testId };
  });
