import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  type: "paragraph" | "heading" | "image" | string;
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

export const listBookChapters = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("ncert_book_chapters" as never)
    .select("id,subject,slug,title,ord,heading_count,para_count,image_count,highlight_count,pyq_count")
    .order("subject", { ascending: true })
    .order("ord", { ascending: true });
  if (error) throw new Error(error.message);
  return { chapters: (data ?? []) as unknown as BookChapter[] };
});

export const getBookChapter = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { data: ch, error: chErr } = await supabaseAdmin
      .from("ncert_book_chapters" as never)
      .select("id,subject,slug,title,ord,heading_count,para_count,image_count,highlight_count,pyq_count")
      .eq("slug", data.slug)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch) throw new Error("Chapter not found");

    const chapter = ch as unknown as BookChapter;
    const blocks: BookBlock[] = [];
    for (let off = 0; ; off += 1000) {
      const { data: page, error } = await supabaseAdmin
        .from("ncert_book_blocks" as never)
        .select("id,idx,type,level,text,content,status,pyq_ids,image_url")
        .eq("chapter_id", chapter.id)
        .order("idx", { ascending: true })
        .range(off, off + 999);
      if (error) throw new Error(error.message);
      const chunk = (page ?? []) as unknown as BookBlock[];
      blocks.push(...chunk);
      if (chunk.length < 1000) break;
      if (blocks.length >= 20000) break;
    }
    return { chapter, blocks };
  });

export const getBookPyqs = createServerFn({ method: "POST" })
  .inputValidator((d: { ids: number[] }) =>
    z.object({ ids: z.array(z.number().int()).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("ncert_book_pyq" as never)
      .select(
        "unique_id,subject,question,answer,explanation,topic_name,chapter_name,difficulty,option_a,option_b,option_c,option_d,image_url",
      )
      .in("unique_id", data.ids);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as BookPyq[] };
  });
