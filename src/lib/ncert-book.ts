// Data access for Highlighted NCERT and NCERT Nuggets from Hostinger MySQL API
import { qbankImageUrl } from "@/lib/qbank-images";

export type BookChapter = {
  id: number;
  subject: string;
  slug: string;
  title: string;
  ord: number;
  heading_count: number;
  para_count: number;
  image_count: number;
  highlight_count: number;
  pyq_count: number;
};

export type Run = { t: "text" | "hl" | "br" | "img"; s?: string; src?: string };

export type BookBlock = {
  id: number;
  idx: number;
  type: string;
  level: number | null;
  text: string | null;
  content: Run[] | null;
  status: string | null;
  pyq_ids: number[] | null;
  image_url: string | null;
};

export type BookPyq = {
  unique_id: number;
  subject: string;
  question: string | null;
  answer: string | null;
  explanation: string | null;
  topic_name: string | null;
  chapter_name: string | null;
  difficulty: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  image_url: string | null;
};

export async function listBookChapters(subject?: string | unknown): Promise<BookChapter[]> {
  try {
    const subjStr = typeof subject === "string" && subject.trim() && !subject.includes("object Object") ? subject.trim() : "";
    const url = subjStr ? `/api/ncert.php?action=book_chapters&subject=${encodeURIComponent(subjStr)}` : `/api/ncert.php?action=book_chapters`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.chapters) ? data.chapters : [];
    }
  } catch (e) {
    console.warn("listBookChapters error:", e);
  }
  return [];
}

export async function getBookChapter(slug: string): Promise<{ chapter: BookChapter; blocks: BookBlock[] } | null> {
  try {
    const res = await fetch(`/api/ncert.php?action=book_chapter&slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.chapter && Array.isArray(data.blocks)) {
        return { chapter: data.chapter, blocks: data.blocks };
      }
    }
  } catch (e) {
    console.warn("getBookChapter error:", e);
  }
  return null;
}

export async function getBookPyqs(ids: number[]): Promise<BookPyq[]> {
  if (!ids.length) return [];
  try {
    const res = await fetch(`/api/ncert.php?action=book_pyqs&ids=${ids.join(",")}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.pyqs) ? data.pyqs : [];
    }
  } catch (e) {
    console.warn("getBookPyqs error:", e);
  }
  return [];
}

export function runsOf(block: BookBlock): Run[] {
  if (Array.isArray(block.content) && block.content.length > 0) return block.content;
  if (block.text) return [{ t: "text", s: block.text }];
  return [];
}

export function resolveBookImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return qbankImageUrl(url);
}

export function runImageSrc(run: Run): string | null {
  return run.src ? resolveBookImage(run.src) : null;
}

/**
 * Candidate URLs for an NCERT-linked PYQ diagram.
 *
 * Stored references are inconsistent across imports: some rows hold a full
 * `ncert/pyq/images/<subject>/<type>/<id>q.png` path, some hold only the file
 * name, some already hold an absolute URL. Return every plausible location in
 * priority order so <NcertPyqImage> can fall through on error.
 */
export function pyqImageCandidates(
  src: string | null | undefined,
  subject?: string | null,
): string[] {
  if (!src) return [];
  const raw = String(src).trim();
  if (!raw) return [];

  // Canonicalize legacy media URLs while preserving unrelated external/data URLs.
  if (/^(?:https?:|data:|blob:)/i.test(raw)) {
    const resolved = qbankImageUrl(raw);
    return resolved ? [resolved] : [];
  }

  const clean = raw.replace(/^\/+/, "").replace(/^public\//i, "");
  const subj = (subject ?? "").toLowerCase().trim();
  const file = clean.split("/").pop() ?? clean;
  if (!file) return [];

  const out: string[] = [];
  const push = (p: string) => {
    const url = qbankImageUrl(p);
    if (url && !out.includes(url)) out.push(url);
  };

  // 1. The stored path itself, as served from public/.
  if (clean.includes("/")) push(clean);

  // 2. Mirrored layouts under public/ncert/pyq.
  if (clean.startsWith("ncert/pyq/images/")) {
    push(`ncert/pyq/${clean.slice("ncert/pyq/images/".length)}`);
  } else if (clean.startsWith("ncert/pyq/")) {
    push(`ncert/pyq/images/${clean.slice("ncert/pyq/".length)}`);
  }

  // 3. Subject-based guesses for bare file names.
  // Avoid guessing generic file names (e.g., 1.png, 2.jpg, fig1.png, q1.png) which belong
  // to different questions and cause diagrams to bleed across questions.
  const isGenericName = /^(?:fig(?:ure)?[_-]?\d+|q(?:uestion)?[_-]?\d+|\d+|image|img|diagram)\.(?:png|jpe?g|webp|svg)$/i.test(file) || file.length <= 7;
  if (subj && !isGenericName) {
    for (const type of ["mcq", "flashcard"]) {
      push(`ncert/pyq/images/${subj}/${type}/${file}`);
      push(`ncert/pyq/${subj}/${type}/${file}`);
    }
  }

  // 4. Last resort: the question-bank resolver.
  const qbank = qbankImageUrl(clean);
  if (qbank && !out.includes(qbank)) out.push(qbank);

  return out;
}
