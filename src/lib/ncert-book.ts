// Data access for the Highlighted NCERT e-book.
// The three `ncert_book_*` tables are public read-only (RLS: SELECT to anon +
// authenticated), so the browser client can read them directly — no server
// function, no service-role key, no SSR fetch of a huge remote JSON file.
import { supabase } from "@/integrations/supabase/client";

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

const CHAPTER_COLS =
  "id,subject,slug,title,ord,heading_count,para_count,image_count,highlight_count,pyq_count";
const BLOCK_COLS = "id,idx,type,level,text,content,status,pyq_ids,image_url";
const PYQ_COLS =
  "unique_id,subject,question,answer,explanation,topic_name,chapter_name,difficulty,option_a,option_b,option_c,option_d,image_url";

// The generated Database types don't include these tables yet.
type QueryBuilder = {
  select: (cols: string) => QueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => QueryBuilder;
  eq: (col: string, val: unknown) => QueryBuilder;
  in: (col: string, vals: unknown[]) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

const db = supabase as unknown as { from: (t: string) => QueryBuilder };

export async function listBookChapters(): Promise<BookChapter[]> {
  const { data, error } = await db
    .from("ncert_book_chapters")
    .select(CHAPTER_COLS)
    .order("subject", { ascending: true })
    .order("ord", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BookChapter[];
}

export async function getBookChapter(
  slug: string,
): Promise<{ chapter: BookChapter; blocks: BookBlock[] }> {
  const { data: ch, error: chErr } = await db
    .from("ncert_book_chapters")
    .select(CHAPTER_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (chErr) throw new Error(chErr.message);
  if (!ch) throw new Error("Chapter not found");
  const chapter = ch as BookChapter;

  // PostgREST caps rows per request, so page through the chapter.
  const PAGE = 1000;
  const blocks: BookBlock[] = [];
  for (let off = 0; off < 40000; off += PAGE) {
    const { data: page, error } = await db
      .from("ncert_book_blocks")
      .select(BLOCK_COLS)
      .eq("chapter_id", chapter.id)
      .order("idx", { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = (page ?? []) as BookBlock[];
    blocks.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return { chapter, blocks };
}

export async function getBookPyqs(ids: number[]): Promise<BookPyq[]> {
  // No cap: fetch every linked PYQ, chunked to keep the request URL short.
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [];
  const CHUNK = 100;
  const out: BookPyq[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await db
      .from("ncert_book_pyq")
      .select(PYQ_COLS)
      .in("unique_id", unique.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as BookPyq[]));
  }
  return out;
}

/** Normalise a stored content array; falls back to plain text. */
export function runsOf(block: BookBlock): Run[] {
  const raw = block.content;
  if (Array.isArray(raw) && raw.length > 0) return raw as Run[];
  if (block.text) return [{ t: "text", s: block.text }];
  return [];
}

/**
 * Resolve an image reference coming from the DB into a servable URL.
 * Stored values vary: absolute URLs, "/ncert/..." paths, "public/ncert/..."
 * paths, or a bare filename such as "Alcohols_Phenols_and_Ethers-image16.png".
 * Bare filenames live in /ncert/{subject}/images/.
 */
export function resolveBookImage(raw: string | null | undefined, subject?: string): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) return v;
  let path = v.replace(/^\.?\//, "").replace(/^public\//, "");
  // PYQ artwork lives under /ncert/pyq/images/... but some rows store it
  // without the "images" segment.
  path = path.replace(/^ncert\/pyq\/(?!images\/)/, "ncert/pyq/images/");
  if (!path.includes("/")) {
    const folder = (subject ?? "biology").toLowerCase();
    path = `ncert/${folder}/images/${path}`;
  }
  return "/" + path.split("/").map(encodeURIComponent).join("/");
}

/** Pick the raw image reference out of an inline run. */
export function runImageSrc(run: Run): string {
  return (run.src ?? run.s ?? "").trim();
}
