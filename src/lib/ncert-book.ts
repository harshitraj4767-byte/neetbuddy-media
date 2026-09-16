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

export async function listBookChapters(subject?: string): Promise<BookChapter[]> {
  try {
    const url = subject ? `/api/ncert.php?action=book_chapters&subject=${encodeURIComponent(subject)}` : `/api/ncert.php?action=book_chapters`;
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
