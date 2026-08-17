import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, ensureSubject, ensureChapter, logAdminAction } from "./admin-content.server";

export const MATERIAL_TYPES = [
  { value: "short_notes",     label: "Short Notes" },
] as const;

export type MaterialType = typeof MATERIAL_TYPES[number]["value"];

export const listStudySubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("subjects")
      .select("id,name")
      .in("id", ["physics", "chemistry", "biology"])
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((s: any) => ({ id: String(s.id), name: s.name, icon: null, color: null }));
  });

export const listStudyChaptersWithMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { subjectId: string; materialType: MaterialType }) =>
    z.object({
      subjectId: z.string().min(1),
      materialType: z.enum(["short_notes"]),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = supabaseAdmin as any;
    const [chRes, mRes] = await Promise.all([
      db.from("chapters").select("id,name,order_index").eq("subject_id", data.subjectId).order("order_index").order("name"),
      db.from("study_materials").select("id,chapter_id,title,pdf_url,is_coming_soon,order_index")
        .eq("subject_id", data.subjectId).eq("material_type", data.materialType).order("order_index"),
    ]);
    if (chRes.error) throw new Error(chRes.error.message);
    if (mRes.error) throw new Error(mRes.error.message);
    const mats = (mRes.data ?? []) as Array<{ id: string; chapter_id: string | null; title: string; pdf_url: string | null; is_coming_soon: boolean; order_index: number }>;
    const chapters = ((chRes.data ?? []) as Array<{ id: string; name: string; order_index: number }>).map((c) => ({ ...c, class: null as number | null }));
    const byChapter = new Map<string, typeof mats>();
    for (const m of mats) {
      if (!m.chapter_id) continue;
      const arr = byChapter.get(m.chapter_id) ?? [];
      arr.push(m);
      byChapter.set(m.chapter_id, arr);
    }
    return chapters.map((c) => ({
      chapter: c,
      materials: byChapter.get(c.id) ?? [],
    }));
  });

const MaterialRow = z.object({
  subject: z.string().min(1),
  chapter: z.string().min(1),
  material_type: z.enum(["short_notes"]),
  title: z.string().min(1),
  pdf_url: z.string().url().nullable().optional(),
  is_coming_soon: z.boolean().optional(),
  order_index: z.number().optional(),
});

export const adminBulkAddStudyMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rows: z.array(MaterialRow).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let created = 0;
    const logs: string[] = [];
    for (const row of data.rows) {
      try {
        const subject = await ensureSubject(row.subject);
        const chapter = await ensureChapter(subject.id, row.chapter);
        const isComingSoon = row.is_coming_soon ?? !row.pdf_url;
        const { error } = await (supabaseAdmin as any).from("study_materials").insert({
          subject_id: subject.id,
          chapter_id: chapter.id,
          material_type: row.material_type,
          title: row.title.trim(),
          pdf_url: row.pdf_url ?? null,
          is_coming_soon: isComingSoon,
          order_index: row.order_index ?? 0,
          created_by: context.userId,
        });
        if (error) throw new Error(error.message);
        created++;
        logs.push(`✅ ${subject.name} · ${chapter.name} · ${row.material_type} — ${row.title}`);
      } catch (e) {
        logs.push(`❌ ${row.subject} · ${row.chapter}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await logAdminAction(context.userId, "bulk_add_study_materials", null, { created, total: data.rows.length });
    return { created, logs };
  });

export const adminListStudyMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await (supabaseAdmin as any)
      .from("study_materials")
      .select("id,material_type,title,pdf_url,is_coming_soon,order_index,created_at,subject_id,chapter_id,subjects(name),chapters(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminDeleteStudyMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any).from("study_materials").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
