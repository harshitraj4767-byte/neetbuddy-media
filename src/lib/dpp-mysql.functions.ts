import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type DppTestDTO = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  duration_min: number;
  total_questions: number;
  marks_correct: number;
  marks_wrong: number;
  source: string;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  type: string;
};

export type DppAttemptDTO = {
  id: string;
  test_id: string;
  status: string;
};

function toIso(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export const getDppTests = createServerFn({ method: "POST" })
  .validator((d: { userId?: string | null } | undefined) => d ?? {})
  .handler(async ({ data }): Promise<{ tests: DppTestDTO[]; attempts: Record<string, DppAttemptDTO> }> => {
    const { query } = await import("@/lib/db/mysql.server");

    const rows = await query<Record<string, unknown>>(
      `SELECT id, title, description, difficulty, duration_min, total_questions,
              marks_correct, marks_wrong, source, created_at, starts_at, ends_at, type
         FROM tests
        WHERE type IN ('dpp', 'daily')
        ORDER BY created_at DESC`
    );

    const tests: DppTestDTO[] = rows.map((r) => ({
      id: String(r["id"]),
      title: String(r["title"] ?? ""),
      description: r["description"] ? String(r["description"]) : null,
      difficulty: String(r["difficulty"] ?? "mixed"),
      duration_min: Number(r["duration_min"] ?? 30),
      total_questions: Number(r["total_questions"] ?? 25),
      marks_correct: Number(r["marks_correct"] ?? 4),
      marks_wrong: Number(r["marks_wrong"] ?? -1),
      source: String(r["source"] ?? "Daily Practice Problem"),
      created_at: toIso(r["created_at"]),
      starts_at: r["starts_at"] ? toIso(r["starts_at"]) : null,
      ends_at: r["ends_at"] ? toIso(r["ends_at"]) : null,
      type: String(r["type"] ?? "dpp"),
    }));

    const attempts: Record<string, DppAttemptDTO> = {};
    if (data?.userId) {
      const attRows = await query<Record<string, unknown>>(
        `SELECT id, test_id, status FROM attempts WHERE CAST(user_id AS CHAR) = ?`,
        [data.userId]
      );
      for (const a of attRows) {
        const tid = String(a["test_id"]);
        attempts[tid] = {
          id: String(a["id"]),
          test_id: tid,
          status: String(a["status"] ?? "pending"),
        };
      }
    }

    return { tests, attempts };
  });
