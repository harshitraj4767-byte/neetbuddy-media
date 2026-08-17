import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin, logAdminAction } from "./admin-content.server";

const SubjectChaptersSchema = z.object({
  subjectId: z.string().uuid(),
  chapterIds: z.array(z.string().uuid()).min(1),
});

const DifficultySchema = z.enum(["easy", "medium", "hard", "mixed"]);

// Preview: count available questions per subject for the given chapters/difficulty.
export const previewMockSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      groups: z.array(SubjectChaptersSchema).min(1),
      difficulty: DifficultySchema.default("mixed"),
      perSubject: z.number().int().min(1).max(200).default(45),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const out: Array<{ subjectId: string; subjectName: string; available: number; chapters: { id: string; name: string }[] }> = [];
    for (const g of data.groups) {
      const { data: subj } = await supabaseAdmin.from("subjects").select("id,name").eq("id", g.subjectId).maybeSingle();
      const { data: chs } = await supabaseAdmin.from("chapters").select("id,name").in("id", g.chapterIds);
      let q = supabaseAdmin
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("subject_id", g.subjectId)
        .in("chapter_id", g.chapterIds);
      if (data.difficulty !== "mixed") q = q.eq("difficulty", data.difficulty);
      const { count } = await q;
      out.push({
        subjectId: g.subjectId,
        subjectName: subj?.name ?? "Subject",
        available: count ?? 0,
        chapters: (chs ?? []).map((c) => ({ id: c.id, name: c.name })),
      });
    }
    return { groups: out, perSubject: data.perSubject };
  });

// Create the mock test: 45 (or N) questions per subject, randomly selected.
export const createMockTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(1000).optional().nullable(),
      difficulty: DifficultySchema.default("mixed"),
      duration_min: z.number().int().min(10).max(360).default(180),
      perSubject: z.number().int().min(1).max(200).default(45),
      groups: z.array(SubjectChaptersSchema).min(1),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const syllabus: Array<{ subjectId: string; subjectName: string; chapters: { id: string; name: string }[] }> = [];
    const allQuestionIds: string[] = [];
    const warnings: string[] = [];

    for (const g of data.groups) {
      const { data: subj } = await supabaseAdmin.from("subjects").select("id,name").eq("id", g.subjectId).maybeSingle();
      const { data: chs } = await supabaseAdmin.from("chapters").select("id,name").in("id", g.chapterIds);
      syllabus.push({
        subjectId: g.subjectId,
        subjectName: subj?.name ?? "Subject",
        chapters: (chs ?? []).map((c) => ({ id: c.id, name: c.name })),
      });

      let query = supabaseAdmin
        .from("questions")
        .select("id")
        .eq("subject_id", g.subjectId)
        .in("chapter_id", g.chapterIds);
      if (data.difficulty !== "mixed") query = query.eq("difficulty", data.difficulty);
      const { data: qs, error } = await query;
      if (error) throw new Error(error.message);
      const ids = (qs ?? []).map((q) => q.id);
      // Fisher–Yates shuffle, take perSubject
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const picked = ids.slice(0, data.perSubject);
      if (picked.length < data.perSubject) {
        warnings.push(`${subj?.name ?? "Subject"}: only ${picked.length} of ${data.perSubject} questions available`);
      }
      allQuestionIds.push(...picked);
    }

    if (allQuestionIds.length === 0) throw new Error("No questions matched the selected chapters/difficulty");

    const { data: test, error: tErr } = await supabaseAdmin
      .from("tests")
      .insert({
        title: data.title.trim(),
        description: data.description?.trim() || null,
        type: "mock",
        difficulty: data.difficulty,
        duration_min: data.duration_min,
        total_questions: allQuestionIds.length,
        question_ids: allQuestionIds,
        source: "NCERT",
        syllabus: syllabus as never,
        created_by: context.userId,
      })
      .select("id,title")
      .maybeSingle();
    if (tErr || !test) throw new Error(tErr?.message ?? "Failed to create mock");

    await logAdminAction(context.userId, "create_mock_test", test.id, {
      subjects: syllabus.length,
      total_questions: allQuestionIds.length,
      per_subject: data.perSubject,
      difficulty: data.difficulty,
      warnings,
    });

    return { id: test.id, title: test.title, total: allQuestionIds.length, warnings };
  });

// ─────────────────────────────────────────────────────────────────────────────
// AI Mock batch generator
// Admin sets just the COUNT. We pull a pool of questions from the DB,
// partition them across N mocks (no question repeats across the batch),
// then call Lovable AI to (a) verify the difficulty mix and (b) decide a title.
// ─────────────────────────────────────────────────────────────────────────────
export const generateAiMockBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      count: z.number().int().min(1).max(20),
      perMock: z.literal(180).default(180),
      difficulty: DifficultySchema.default("mixed"),
      duration_min: z.number().int().min(10).max(360).default(180),
      category_id: z.string().uuid().nullable().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getActiveAiKey } = await import("./ai-keys.functions");

    type PoolQ = { id: string; subject_id: string; chapter_id: string | null; difficulty: string | null };
    // Supabase/PostgREST caps a single response at ~1000 rows regardless of
    // `.limit(...)`. Page through with .range() to actually fetch the full
    // pool (the DB really has thousands of questions).
    const items: PoolQ[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      let q = supabaseAdmin
        .from("questions")
        .select("id,subject_id,chapter_id,difficulty")
        .range(offset, offset + PAGE - 1);
      if (data.difficulty !== "mixed") q = q.eq("difficulty", data.difficulty);
      const { data: page, error: poolErr } = await q;
      if (poolErr) throw new Error(poolErr.message);
      const chunk = (page ?? []) as PoolQ[];
      items.push(...chunk);
      if (chunk.length < PAGE) break;
      if (items.length >= 50000) break; // safety cap
    }
    const needed = data.count * data.perMock;
    if (items.length < needed) {
      throw new Error(
        `Not enough questions in DB (need ${needed}, have ${items.length}). Reduce count or perMock.`,
      );
    }

    // Pull subject names once for titling.
    const { data: subs } = await supabaseAdmin.from("subjects").select("id,name");
    const subjectName = new Map<string, string>(
      (subs ?? []).map((s: any) => [s.id, s.name as string]),
    );

    // Group by subject so we can interleave fairly across mocks.
    const bySubject = new Map<string, PoolQ[]>();
    for (const it of items) {
      const arr = bySubject.get(it.subject_id) ?? [];
      arr.push(it);
      bySubject.set(it.subject_id, arr);
    }
    // Shuffle each bucket.
    for (const arr of bySubject.values()) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }

    // Build N mocks. Strategy: distribute per-subject quotas first, then top up
    // any short bucket from a global remaining pool so EVERY mock ends with
    // exactly `perMock` questions. If we cannot reach perMock for any bucket,
    // fail loudly so the admin gets a clear error instead of silent 5-q mocks.
    const buckets: Array<PoolQ[]> = Array.from({ length: data.count }, () => []);
    const subjectIds = Array.from(bySubject.keys());
    const subjectCount = subjectIds.length || 1;
    const baseQuota = Math.floor(data.perMock / subjectCount);
    const remainder = data.perMock - baseQuota * subjectCount;
    const cursors = new Map<string, number>(subjectIds.map((s) => [s, 0]));

    for (let mIdx = 0; mIdx < data.count; mIdx++) {
      for (let sIdx = 0; sIdx < subjectIds.length; sIdx++) {
        const sid = subjectIds[sIdx];
        const arr = bySubject.get(sid)!;
        const quota = baseQuota + (sIdx < remainder ? 1 : 0);
        let taken = 0;
        while (taken < quota) {
          const c = cursors.get(sid)!;
          if (c >= arr.length) break;
          buckets[mIdx].push(arr[c]);
          cursors.set(sid, c + 1);
          taken++;
        }
      }
    }

    // Top-up phase: walk every subject in round-robin until each bucket reaches perMock.
    for (let mIdx = 0; mIdx < data.count; mIdx++) {
      let safety = 0;
      while (buckets[mIdx].length < data.perMock && safety++ < 10000) {
        let placed = false;
        for (const sid of subjectIds) {
          if (buckets[mIdx].length >= data.perMock) break;
          const arr = bySubject.get(sid)!;
          const c = cursors.get(sid)!;
          if (c < arr.length) {
            buckets[mIdx].push(arr[c]);
            cursors.set(sid, c + 1);
            placed = true;
          }
        }
        if (!placed) break;
      }
    }

    // Hard-validate every bucket. Don't ship a mock with the wrong question count.
    const short = buckets.findIndex((b) => b.length !== data.perMock);
    if (short !== -1) {
      throw new Error(
        `Could not build ${data.count} mocks of ${data.perMock} questions — mock #${short + 1} only has ${buckets[short].length}. ` +
        `Question pool exhausted. Reduce count/perMock or add more questions.`,
      );
    }


    // Build summaries for AI titling and difficulty verification.
    const summaries = buckets.map((arr, i) => {
      const bySub: Record<string, number> = {};
      const byDiff: Record<string, number> = { easy: 0, medium: 0, hard: 0, unknown: 0 };
      for (const q of arr) {
        const name = subjectName.get(q.subject_id) ?? "Unknown";
        bySub[name] = (bySub[name] ?? 0) + 1;
        const d = (q.difficulty ?? "").toLowerCase();
        if (d === "easy" || d === "medium" || d === "hard") byDiff[d]++;
        else byDiff.unknown++;
      }
      return { idx: i + 1, total: arr.length, bySubject: bySub, byDifficulty: byDiff };
    });

    // Ask AI to decide a short title + verified level per mock.
    let aiTitles: Array<{ title: string; level: "Easy" | "Medium" | "Hard" | "Mixed" }> = [];
    try {
      const apiKey = await getActiveAiKey();
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You generate short, distinct mock-test titles for NEET aspirants. Titles MUST be 3–6 words, no quotes, no emojis, and MUST NOT contain the words 'AI' or 'Generated' anywhere. Verify difficulty from the byDifficulty counts (>=60% in one bucket = that level, else Mixed)." },
            { role: "user", content: `Produce one title per mock based on subject distribution and difficulty mix. Mocks: ${JSON.stringify(summaries)}` },
          ],
          tools: [{
            type: "function",
            function: {
              name: "emit_titles",
              parameters: {
                type: "object",
                properties: {
                  titles: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        idx: { type: "integer" },
                        title: { type: "string" },
                        level: { type: "string", enum: ["Easy", "Medium", "Hard", "Mixed"] },
                      },
                      required: ["idx", "title", "level"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["titles"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "emit_titles" } },
        }),
      });
      if (res.ok) {
        const j: any = await res.json();
        const call = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        const parsed = call ? JSON.parse(call) : null;
        if (parsed?.titles) {
          aiTitles = parsed.titles
            .sort((a: any, b: any) => a.idx - b.idx)
            .map((t: any) => ({ title: String(t.title).trim().slice(0, 120), level: t.level }));
        }
      } else {
        console.warn("AI titling failed", res.status, await res.text().catch(() => ""));
      }
    } catch (e) {
      console.warn("AI titling threw", e);
    }

    const created: Array<{ id: string; title: string; total: number; level: string }> = [];
    const stamp = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < buckets.length; i++) {
      const ids = buckets[i].map((q) => q.id);
      const ai = aiTitles[i];
      // Strip any leading "AI " the model might prepend — admins don't want
      // "AI" in the user-visible mock title.
      const rawTitle = (ai?.title || `Mock ${i + 1} · ${stamp}`).trim();
      const cleaned = rawTitle.replace(/^ai\s+/i, "").replace(/\s+ai\s+/gi, " ").trim();
      const title = (cleaned || `Mock ${i + 1} · ${stamp}`).slice(0, 200);
      const level = ai?.level ?? (data.difficulty === "mixed" ? "Mixed" : data.difficulty);

      const { data: test, error: tErr } = await (supabaseAdmin as any)
        .from("tests")
        .insert({
          title,
          description: `Auto-generated mock #${i + 1} of ${buckets.length}. Difficulty: ${level}.`,
          type: "mock",
          difficulty: data.difficulty,
          duration_min: data.duration_min,
          total_questions: ids.length,
          question_ids: ids,
          source: "AI",
          syllabus: [] as never,
          created_by: context.userId,
          category_id: data.category_id ?? null,
        })
        .select("id,title")
        .maybeSingle();
      if (tErr || !test) throw new Error(tErr?.message ?? "Failed to insert mock");
      created.push({ id: test.id, title: test.title, total: ids.length, level: String(level) });
    }

    await logAdminAction(context.userId, "ai_generate_mock_batch", null, {
      count: data.count,
      per_mock: data.perMock,
      difficulty: data.difficulty,
      ai_titles_used: aiTitles.length > 0,
    });

    return { created };
  });

// Admin delete a test (any type). Cascades via FK: attempts, contests, battle_matches.
export const adminDeleteTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(context.userId, "delete_test", data.id, {});
    return { ok: true };
  });
