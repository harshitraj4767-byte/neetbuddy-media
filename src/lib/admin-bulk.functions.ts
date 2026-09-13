import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, logAdminAction } from "./admin-content.server";

export const bulkDeleteByChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ chapterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { count: qcount } = await supabaseAdmin
      .from("questions").select("id", { count: "exact", head: true }).eq("chapter_id", data.chapterId);
    const { error } = await supabaseAdmin.from("questions").delete().eq("chapter_id", data.chapterId);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "bulk_delete_chapter", data.chapterId, { questions_deleted: qcount ?? 0 });
    return { deleted: qcount ?? 0 };
  });

export const bulkDeleteBySubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ subjectId: z.string().uuid(), alsoDeleteTests: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { count: qcount } = await supabaseAdmin
      .from("questions").select("id", { count: "exact", head: true }).eq("subject_id", data.subjectId);
    const { error: qErr } = await supabaseAdmin.from("questions").delete().eq("subject_id", data.subjectId);
    if (qErr) throw new Error(qErr.message);
    let testsDeleted = 0;
    if (data.alsoDeleteTests) {
      const { data: tests } = await supabaseAdmin.from("tests").select("id,title");
      const subjName = (await supabaseAdmin.from("subjects").select("name").eq("id", data.subjectId).maybeSingle()).data?.name ?? "";
      const ids = (tests ?? []).filter((t) => t.title?.toLowerCase().includes(subjName.toLowerCase())).map((t) => t.id);
      if (ids.length) {
        await supabaseAdmin.from("tests").delete().in("id", ids);
        testsDeleted = ids.length;
      }
    }
    await logAdminAction(context.userId, "bulk_delete_subject", data.subjectId, { questions_deleted: qcount ?? 0, tests_deleted: testsDeleted });
    return { deleted: qcount ?? 0, testsDeleted };
  });

// Scan duplicates grouped by text_hash (fallback: normalized text). Keeps oldest, returns duplicate ids.
async function scanDuplicates() {
  const all: { id: string; text: string; text_hash: string | null; created_at: string }[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("questions")
      .select("id,text,text_hash,created_at")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const groups = new Map<string, { keep: string; dups: string[] }>();
  for (const q of all) {
    const key = (q.text_hash || q.text || "").trim().toLowerCase();
    if (!key) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { keep: q.id, dups: [] });
    else g.dups.push(q.id);
  }
  let duplicateCount = 0;
  const dupIds: string[] = [];
  const groupCount = { value: 0 };
  for (const g of groups.values()) {
    if (g.dups.length > 0) {
      duplicateCount += g.dups.length;
      groupCount.value += 1;
      dupIds.push(...g.dups);
    }
  }
  return { duplicateCount, groupCount: groupCount.value, dupIds, totalQuestions: all.length };
}

export const scanDuplicateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const r = await scanDuplicates();
    return { duplicateCount: r.duplicateCount, groupCount: r.groupCount, totalQuestions: r.totalQuestions };
  });

export const dedupeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const r = await scanDuplicates();
    let deleted = 0;
    // delete in chunks of 200
    for (let i = 0; i < r.dupIds.length; i += 200) {
      const chunk = r.dupIds.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("questions").delete().in("id", chunk);
      if (error) throw new Error(error.message);
      deleted += chunk.length;
    }
    await logAdminAction(context.userId, "dedupe_questions", null, { deleted, groups: r.groupCount });
    return { deleted, groupCount: r.groupCount };
  });
