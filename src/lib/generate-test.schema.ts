// Input schema + difficulty mapping for the Generate Test server function.
// Kept out of `generate-test.functions.ts` so that file stays a thin
// server-function wrapper (module scope there must not hold runtime values).

import { z } from "zod";

export const CreateCustomTestSchema = z.object({
  // Chapter IDs are bigint from qb_chapters, sent as strings from the client.
  chapter_ids: z.array(z.string().min(1)).min(1).max(30),
  // Optional sub-topic narrowing. Empty/omitted means "all topics".
  topic_ids: z.array(z.string().min(1)).max(500).optional(),
  subtopic_ids: z.array(z.string().min(1)).max(2000).optional(),
  subject_name: z.string().min(1).max(80),
  count: z.number().int().min(5).max(90),
  difficulty: z.enum(["mix", "easy", "medium", "hard"]),
  duration_min: z.number().int().min(5).max(180),
});

export type CreateCustomTestInput = z.infer<typeof CreateCustomTestSchema>;

/** UI difficulty slug -> the exact string stored in qb_questions.difficulty. */
export const DIFFICULTY_DB_VALUE: Record<string, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};
