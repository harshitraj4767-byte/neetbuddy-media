/**
 * Shared question-media attachment.
 *
 * Turns the various image sources into markdown image references embedded in
 * the question text / explanation / option text, so a single renderer
 * (<RichText />) handles everything and every page behaves identically.
 *
 * Sources, in priority order:
 *   1. `question_image_url` from the DB (relative path -> resolved via
 *      qbank-images.ts, so the host is configurable).
 *   2. Rows in `question_diagrams` (DB-stored blobs served at
 *      /api/public/diagram/<id>).
 *   3. `explanation_image_url` from the DB (kept in sync with the image host by
 *      scripts/sync-diagrams.py).
 *
 * Missing files are harmless: RichText hides any image that fails to load.
 */

import { qbankImageUrl } from "@/lib/qbank-images";

export type MediaQuestion = {
  id: string;
  text?: string | null;
  explanation?: string | null;
  options?: string[] | null;
  subject_id?: string | null;
  chapter_id?: string | null;
  question_image_url?: string | null;
  explanation_image_url?: string | null;
};

const EMBEDDED_IMG_RE = /!\[[^\]]*\]\([^)]+\)|<img\b/i;

function alreadyHas(text: string, url: string): boolean {
  return text.includes(url);
}

export function attachQuestionMedia<T extends MediaQuestion>(
  q: T,
  extra?: { diagramUrls?: string[]; optionImageIndexes?: Set<number> },
): T {
  const questionUrls: string[] = [];
  const dbUrl = qbankImageUrl(q.question_image_url);
  if (dbUrl) questionUrls.push(dbUrl);
  for (const u of extra?.diagramUrls ?? []) if (!questionUrls.includes(u)) questionUrls.push(u);

  let text = q.text ?? "";
  if (questionUrls.length) {
    // Fill any [diagram] / [diagram 2] placeholders first, then append the rest.
    let n = 0;
    text = text.replace(/(!?)\[diagram\s*(\d+)?\]/gi, (whole, bang: string) => {
      if (bang === "!") return whole; // already an embedded image
      const url = questionUrls[n] ?? questionUrls[questionUrls.length - 1];
      n++;
      return `\n\n![diagram](${url})`;
    });
    const remaining = questionUrls.slice(n).filter((u) => !alreadyHas(text, u));
    if (remaining.length && !(n === 0 && EMBEDDED_IMG_RE.test(text) && remaining.every((u) => alreadyHas(text, u)))) {
      text = `${text}\n\n${remaining.map((u) => `![diagram](${u})`).join("\n\n")}`;
    }
  }

  let explanation = q.explanation ?? "";
  // Explanation images come from the DB column only. We deliberately do NOT
  // guess convention URLs for every question — that would fire one 404 per
  // question across a 54k-question bank. `scripts/sync-diagrams.py` writes the
  // column for whatever files exist on the image host.
  const explUrls = [qbankImageUrl(q.explanation_image_url)].filter((u): u is string => Boolean(u));
  const explToAdd = explUrls.filter((u) => !alreadyHas(explanation, u));
  if (explToAdd.length) {
    explanation = `${explanation}\n\n${explToAdd.map((u) => `![explanation](${u})`).join("\n\n")}`;
  }

  const options = (q.options ?? []).map((o, i) => {
    if (!extra?.optionImageIndexes?.has(i)) return o;
    const url = `/api/public/option-image/${q.id}/${i}`;
    const plain = (o ?? "").trim();
    const label = plain && plain !== "[image]" ? plain : "";
    return `${label ? label + "\n\n" : ""}![option](${url})`;
  });

  return { ...q, text, explanation, options } as T;
}
