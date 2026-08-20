/**
 * Per-option image resolution from the static file manifest.
 *
 * The image library ships files named
 *     {subject}/{chapterId}_{questionId}_optimg_{optionNumber}_1.png
 *     {subject}/{chapterId}_{questionId}_opt_{optionNumber}_1.png
 *     {subject}/{chapterId}_{questionId}_qtext_1.png
 * but the database has NO rows pointing at them (`question_option_images` is
 * empty and there is no per-option URL column). So the mapping lives in
 * `option-images.json`, generated from the files themselves by
 * `scripts/build-option-image-manifest.py`.
 *
 * Keys are the numeric question id (`questions.id` as text).
 */

import manifest from "./option-images.json";
import { qbankImageUrl } from "@/lib/qbank-images";

type Manifest = {
  options: Record<string, Record<string, string>>;
  qtext: Record<string, string[]>;
};

const DATA = manifest as unknown as Manifest;

function key(questionId: string | number | null | undefined): string | null {
  if (questionId === null || questionId === undefined) return null;
  const s = String(questionId).trim();
  // Only numeric ids exist in the manifest (uuid-keyed questions have none).
  return /^\d+$/.test(s) ? String(Number(s)) : null;
}

/** Resolved image URL for one option, or null when there is no file. */
export function optionImageUrl(
  questionId: string | number | null | undefined,
  optionIndex: number,
): string | null {
  const k = key(questionId);
  if (!k) return null;
  const path = DATA.options[k]?.[String(optionIndex)];
  return path ? qbankImageUrl(path) : null;
}

/** True when this question has at least one option image file. */
export function hasOptionImages(questionId: string | number | null | undefined): boolean {
  const k = key(questionId);
  return Boolean(k && DATA.options[k]);
}

/** Extra question-text panels (`*_qtext_1.png`) for this question. */
export function questionTextImageUrls(questionId: string | number | null | undefined): string[] {
  const k = key(questionId);
  if (!k) return [];
  return (DATA.qtext[k] ?? [])
    .map((p) => qbankImageUrl(p))
    .filter((u): u is string => Boolean(u));
}
