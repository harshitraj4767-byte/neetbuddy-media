// Question-bank image resolution (diagrams, option images, explanation images).
//
// Images are served directly via free jsDelivr CDN from the public neetbuddy-media repository.
// DB stores relative paths like 'physics/12_111826_question_1.png' or '/img/data/physics/...'.

const RAW_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_QBANK_IMAGE_BASE) ||
  "https://cdn.jsdelivr.net/gh/harshitraj4767-byte/neetbuddy-media@main/public/img/data/";

const ABSOLUTE_RE = /^(?:https?:|data:|blob:)/i;
const QBANK_PATH_RE = /^\/(?:public\/)?(?:img\/data\/|(?:physics|chemistry|biology)\/)/i;

/** Strip host/serving prefixes so only `subject/file.png` remains. */
export function normalizeQbankImagePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const raw = String(pathOrUrl).trim();
  if (!raw) return null;
  if (ABSOLUTE_RE.test(raw)) return raw;
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

export function isRelativeQbankPath(s: string): boolean {
  return !ABSOLUTE_RE.test(s) && !s.startsWith("/");
}
