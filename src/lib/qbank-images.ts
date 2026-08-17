// Question-bank image resolution (diagrams, option images, explanation images).
//
// ── HOW IMAGE PATHS ARE STORED ────────────────────────────────────────────────
// The DB stores ONLY a host-agnostic relative path, e.g.
//     chemistry/15_103519_question_1.png
// (`qb_questions.question_image_url`, `qb_questions.explanation_image_url`).
// Legacy values such as `/img/data/chemistry/x.png`, `/chemistry/x.png` or
// `public/chemistry/x.png` are normalised here, and absolute URLs
// (https:, data:, blob:) are passed through untouched. Because nothing but the
// relative path lives in the database, the image host can change at any time
// with zero data migration.
//
// ── WHERE THE IMAGES ARE SERVED FROM ──────────────────────────────────────────
// Default: `/img/data/` inside this app's `public/` folder (works offline, good
// for a few hundred files).
//
// For a large library (10k–50k diagrams, hundreds of MB) do NOT keep the files
// in this repo. Push them to a separate PUBLIC GitHub repo and serve them free
// through the jsDelivr CDN, then set ONE env var:
//
//     VITE_QBANK_IMAGE_BASE=https://cdn.jsdelivr.net/gh/<user>/<repo>@main
//
// The folder layout inside that repo must stay exactly:
//     chemistry/<chapterId>_<questionId>_question_1.png
//     physics/...     biology/...
// so every path already in the database keeps working. See docs/DIAGRAMS.md.

const RAW_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_QBANK_IMAGE_BASE) ||
  "/img/data/";

const ABSOLUTE_RE = /^(?:https?:|data:|blob:)/i;
/** App-absolute paths that really are question-bank files. */
const QBANK_PATH_RE = /^\/(?:public\/)?(?:img\/data\/|(?:physics|chemistry|biology)\/)/i;


/** Strip host/serving prefixes so only `subject/file.png` remains. */
export function normalizeQbankImagePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const raw = String(pathOrUrl).trim();
  if (!raw) return null;
  if (ABSOLUTE_RE.test(raw)) return raw;
  // App-absolute URLs that are NOT question-bank files (e.g. DB-backed
  // diagrams at /api/public/diagram/<id>) must pass through untouched.
  if (raw.startsWith("/") && !QBANK_PATH_RE.test(raw)) return raw;
  let s = raw.replace(/^\/+/, "");
  s = s.replace(/^public\//i, "");
  s = s.replace(/^img\/data\//i, "");
  return s || null;
}


/** Resolve a stored path (or absolute URL) to something an <img src> can use. */
export function qbankImageUrl(pathOrUrl: string | null | undefined): string | null {
  const s = normalizeQbankImagePath(pathOrUrl);
  if (!s) return null;
  if (ABSOLUTE_RE.test(s) || s.startsWith("/")) return s;
  const base = RAW_BASE.endsWith("/") ? RAW_BASE : `${RAW_BASE}/`;
  return base + s;
}

/**
 * True when the string looks like a question-bank image reference that still
 * needs resolving (i.e. it is not already an absolute or app-absolute URL).
 */
export function isRelativeQbankPath(s: string): boolean {
  return !ABSOLUTE_RE.test(s) && !s.startsWith("/");
}
