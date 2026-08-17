import diagramMap from "./data/diagrams.json";
import chapterMeta from "./data/chapter-meta.json";

export function metaFor(cls: string, chapter: number): { important: boolean; expected_2027: number } {
  const k = `${classKey(cls)}-${chapter}`;
  return (chapterMeta as Record<string, { important: boolean; expected_2027: number }>)[k] ?? { important: false, expected_2027: 0 };
}

export type ParagraphItem = {
  type: "paragraph";
  paragraph_number?: number;
  text: string;
  has_pyq?: boolean;
  pyq_count?: number;
  predicted?: boolean;
  prediction?: {
    category?: string;
    badge?: string;
    confidence?: number;
    reason?: string;
  } | null;
};

export type HeadingItem = { type: "heading"; level: number; text: string };
export type ImageItem = {
  type: "image";
  image_id?: string;
  file?: string;
  description?: string;
  caption?: string;
};
export type TableItem = { type: "table"; text: string };
export type CaptionItem = { type: "caption"; text: string };

export type ContentItem =
  | ParagraphItem
  | HeadingItem
  | ImageItem
  | TableItem
  | CaptionItem
  | { type: string; [k: string]: unknown };

export interface NcertPage {
  page_number: number;
  content: ContentItem[];
}

export interface NcertChapter {
  chapter_number: number;
  chapter_name: string;
  class: string;
  total_paragraphs?: number;
  total_images?: number;
  total_pyqs?: number;
  predicted_count?: number;
  pyq_density?: number;
  pages: NcertPage[];
}

export interface NcertData {
  subject: string;
  total_chapters: number;
  chapters: NcertChapter[];
}

const SRC = "https://neetugmocks.in/ncert/ncert-pyq.json";

let cache: Promise<NcertData> | null = null;
export function fetchNcert(): Promise<NcertData> {
  if (!cache) {
    cache = fetch(SRC).then((r) => {
      if (!r.ok) throw new Error("Failed to load NCERT data");
      return r.json();
    });
  }
  return cache;
}

export function classKey(c: string): "11" | "12" {
  return c.includes("12") ? "12" : "11";
}

export function diagramsFor(cls: string, chapter: number): string[] {
  const k = `${classKey(cls)}-${chapter}`;
  return (diagramMap as Record<string, string[]>)[k] ?? [];
}

/** Parse a markdown table block into rows. */
export function parseMarkdownTable(src: string): {
  title?: string;
  headers: string[];
  rows: string[][];
} | null {
  const lines = src.split("\n").map((l) => l.trim()).filter(Boolean);
  // Optional title line that doesn't start with |
  let title: string | undefined;
  let i = 0;
  if (lines[0] && !lines[0].startsWith("|")) {
    title = lines[0];
    i = 1;
  }
  const tableLines = lines.slice(i).filter((l) => l.startsWith("|"));
  if (tableLines.length < 2) return null;
  const parse = (l: string) =>
    l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const headers = parse(tableLines[0]);
  // skip separator row (---)
  const dataStart = /^[-:\s|]+$/.test(tableLines[1]) ? 2 : 1;
  const rows = tableLines.slice(dataStart).map(parse);
  return { title, headers, rows };
}
