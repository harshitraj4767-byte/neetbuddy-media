// Bulk-imports /tmp/qbank/*.json into the new Supabase project.
// Run: bun scripts/import-qbank.ts
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_SERVICE_ROLE_KEY!;
if (!URL || !KEY) { console.error("Missing SB_URL / SB_SERVICE_ROLE_KEY"); process.exit(1); }

const admin: any = createClient(URL, KEY, { auth: { persistSession: false } });

const ROOT = process.env.QBANK_DIR || "/tmp/qbank";
const SUBJECT_DIRS = ["physics", "chemistry", "biology"] as const;
const SUBJECT_NAME: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", biology: "Biology" };

type BankQ = {
  id: number; question: string; explanation?: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  difficulty?: string; type?: string;
  subject: string; chapter: string;
  topic?: string; subtopic?: string;
  topic_id?: number; chapter_id?: number; subtopic_id?: number; subject_id?: number;
  year?: string | number | null; tag?: string | null;
};

const BATCH = 500;

async function upsertBatch(table: string, rows: any[], onConflict = "id") {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).upsert(chunk, { onConflict });
    if (error) { console.error(`  ! ${table} batch ${i}-${i+chunk.length}: ${error.message}`); throw error; }
  }
}

function isExplanationImage(s?: string) {
  if (!s) return false;
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(s.trim());
}

async function main() {
  // 1) Subjects
  await upsertBatch("qb_subjects", SUBJECT_DIRS.map(d => ({ id: d, name: SUBJECT_NAME[d] })));
  console.log("subjects ok");

  const chaptersMap = new Map<number, { subject_id: string; name: string; count: number }>();
  const topicsMap = new Map<number, { chapter_id: number; name: string }>();
  const subtopicsMap = new Map<number, { topic_id: number; name: string }>();
  const questionRows: any[] = [];

  for (const subj of SUBJECT_DIRS) {
    const dir = path.join(ROOT, subj);
    if (!fs.existsSync(dir)) { console.log(`skip ${dir}`); continue; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    for (const f of files) {
      const arr: BankQ[] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const q of arr) {
        const chId = Number(q.chapter_id);
        if (!Number.isFinite(chId)) continue;
        if (!chaptersMap.has(chId)) chaptersMap.set(chId, { subject_id: subj, name: q.chapter, count: 0 });
        chaptersMap.get(chId)!.count += 1;

        if (q.topic_id && q.topic) {
          topicsMap.set(Number(q.topic_id), { chapter_id: chId, name: q.topic });
        }
        if (q.subtopic_id && q.subtopic && q.topic_id) {
          subtopicsMap.set(Number(q.subtopic_id), { topic_id: Number(q.topic_id), name: q.subtopic });
        }

        const opts = (q.options ?? []).slice(0, 4);
        while (opts.length < 4) opts.push({ id: String(opts.length + 1), text: "", isCorrect: false });
        const ci = Math.max(0, opts.findIndex(o => o.isCorrect));

        const yr = q.year != null && q.year !== "" ? Number(q.year) : null;
        const exp = q.explanation ?? null;
        questionRows.push({
          id: q.id,
          subject_id: subj,
          chapter_id: chId,
          topic_id: q.topic_id ?? null,
          subtopic_id: q.subtopic_id ?? null,
          question_html: q.question,
          options: opts,
          correct_index: ci,
          explanation: isExplanationImage(exp) ? null : exp,
          explanation_image_url: isExplanationImage(exp) ? exp : null,
          difficulty: q.difficulty ?? "Medium",
          qtype: q.type ?? "MCQ",
          year: Number.isFinite(yr as number) ? yr : null,
          tag: q.tag ?? null,
        });
      }
      console.log(`  parsed ${subj}/${f}  (running total questions=${questionRows.length})`);
    }
  }

  // 2) Chapters
  const chapterRows = [...chaptersMap.entries()].map(([id, v]) => ({
    id, subject_id: v.subject_id, name: v.name, question_count: v.count,
  }));
  await upsertBatch("qb_chapters", chapterRows);
  console.log(`chapters ok (${chapterRows.length})`);

  // 3) Topics + subtopics (parents must exist first)
  const topicRows = [...topicsMap.entries()].map(([id, v]) => ({ id, chapter_id: v.chapter_id, name: v.name }));
  await upsertBatch("qb_topics", topicRows);
  console.log(`topics ok (${topicRows.length})`);

  const subRows = [...subtopicsMap.entries()].map(([id, v]) => ({ id, topic_id: v.topic_id, name: v.name }));
  await upsertBatch("qb_subtopics", subRows);
  console.log(`subtopics ok (${subRows.length})`);

  // 4) Questions
  console.log(`inserting ${questionRows.length} questions in batches of ${BATCH}...`);
  const t0 = Date.now();
  let done = 0;
  for (let i = 0; i < questionRows.length; i += BATCH) {
    const chunk = questionRows.slice(i, i + BATCH);
    const { error } = await admin.from("qb_questions").upsert(chunk, { onConflict: "id" });
    if (error) { console.error(`  ! batch ${i}: ${error.message}`); throw error; }
    done += chunk.length;
    if (done % 5000 < BATCH) console.log(`   ${done}/${questionRows.length}  (${Math.round((Date.now()-t0)/1000)}s)`);
  }
  console.log(`done in ${Math.round((Date.now()-t0)/1000)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
