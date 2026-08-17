/**
 * Question diagram naming convention.
 *
 * Every diagram file is named:
 *     {subject}/{chapterId}_{questionId}_{kind}_{n}.(png|jpg|jpeg|webp|svg)
 *   subject ∈ physics | chemistry | biology
 *   kind    ∈ question | explanation | option
 *
 * IMPORTANT (scaling to 20k+ diagrams):
 * There is deliberately NO `import.meta.glob` here. Globbing the public folder
 * forced Vite to enumerate and fingerprint every image at build time, which
 * breaks down badly once the library grows to thousands of files. Instead:
 *
 *   • The primary source of truth is the database column
 *     `qb_questions.question_image_url` (a relative path, see qbank-images.ts).
 *   • Extra files that follow the convention are addressed by computing their
 *     URL directly — no build step, no manifest, no redeploy. If a file does
 *     not exist the <img> simply hides itself (RichText attaches an onError
 *     handler), so a missing diagram can never break a question.
 *
 * That means new diagrams can be added to the image host (GitHub + jsDelivr,
 * or public/img/data) at any time and they light up immediately.
 */

import { qbankImageUrl } from "@/lib/qbank-images";

export type DiagramKind = "question" | "explanation" | "option";

const SUBJECT_FOLDERS = new Set(["physics", "chemistry", "biology"]);

function folderFor(subjectId: string | null | undefined, subjectName?: string | null): string | null {
  const s = `${subjectId ?? ""} ${subjectName ?? ""}`.toLowerCase();
  if (s.includes("phys")) return "physics";
  if (s.includes("chem")) return "chemistry";
  if (s.includes("bio") || s.includes("bot") || s.includes("zoo")) return "biology";
  const direct = (subjectId ?? "").toLowerCase();
  return SUBJECT_FOLDERS.has(direct) ? direct : null;
}

/** Relative convention path, e.g. `chemistry/15_103372_explanation_1.png`. */
export function diagramPath(args: {
  subjectId?: string | null;
  subjectName?: string | null;
  chapterId?: string | number | null;
  questionId: string | number;
  kind: DiagramKind;
  index?: number;
  ext?: string;
}): string | null {
  const folder = folderFor(args.subjectId, args.subjectName);
  if (!folder || args.chapterId == null) return null;
  const n = args.index ?? 1;
  const ext = args.ext ?? "png";
  return `${folder}/${args.chapterId}_${args.questionId}_${args.kind}_${n}.${ext}`;
}

/** Fully resolved URL for a convention-named diagram (null when not derivable). */
export function diagramUrl(args: Parameters<typeof diagramPath>[0]): string | null {
  const p = diagramPath(args);
  return p ? qbankImageUrl(p) : null;
}
