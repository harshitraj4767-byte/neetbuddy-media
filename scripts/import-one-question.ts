import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseLenientJson } from "../src/lib/json-utils.ts";

const URL = process.env.SB_URL!;
const KEY = process.env.SB_SERVICE_ROLE_KEY!;
const admin: any = createClient(URL, KEY, { auth: { persistSession: false } });

const raw = fs.readFileSync(process.argv[2], "utf8");
const parsed: any = parseLenientJson(raw);
const items = Array.isArray(parsed) ? parsed : [parsed];

const SUBJECT_CANON: Record<string, string> = { biology: "Biology", physics: "Physics", chemistry: "Chemistry", botany: "Botany", zoology: "Zoology" };
function displaySubject(s: string) { const k = s.trim().toLowerCase(); return SUBJECT_CANON[k] ?? s.trim(); }

async function ensureSubject(name: string) {
  const clean = displaySubject(name);
  const { data: ex } = await admin.from("subjects").select("id,name").ilike("name", clean).maybeSingle();
  if (ex?.id) return ex.id;
  const { data, error } = await admin.from("subjects").insert({ name: clean }).select("id").maybeSingle();
  if (error) throw error;
  return data!.id;
}
async function ensureChapter(subject_id: string, name: string) {
  const clean = name.trim();
  const { data: rows } = await admin.from("chapters").select("id,name").eq("subject_id", subject_id);
  const hit = (rows ?? []).find((r: any) => r.name.trim().toLowerCase() === clean.toLowerCase());
  if (hit) return hit.id;
  const { data, error } = await admin.from("chapters").insert({ subject_id, name: clean, order_index: 0 }).select("id").maybeSingle();
  if (error) throw error;
  return data!.id;
}

function sniffMime(b64: string) {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBORw")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
function b64ToBytea(b64: string) {
  const clean = b64.replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  return "\\x" + Buffer.from(clean, "base64").toString("hex");
}
function extractInline(str: string) {
  const m = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(str);
  if (!m) return null;
  const payload = m[2].trim();
  if (/^(https?:\/\/|\/[a-z])/i.test(payload) && !/^\/9j\//.test(payload)) return null;
  const dm = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(payload);
  let mime = "image/png", b64 = payload.replace(/\s+/g, "");
  if (dm) { mime = dm[1]; b64 = dm[2]; } else { mime = sniffMime(b64); }
  return { alt: m[1], mime, b64 };
}

for (const q of items) {
  const subject_id = await ensureSubject(q.subject ?? "Biology");
  const chapter_id = await ensureChapter(subject_id, q.chapter ?? "General");

  const optTexts: string[] = [];
  const optImgs: Array<{ index: number; mime: string; b64: string }> = [];
  (q.options ?? []).slice(0, 4).forEach((o: any, i: number) => {
    if (typeof o === "string") {
      const inl = extractInline(o);
      if (inl) { optImgs.push({ index: i, mime: inl.mime, b64: inl.b64 }); optTexts.push(inl.alt || "[image]"); }
      else optTexts.push(o);
    } else optTexts.push(String(o));
  });
  while (optTexts.length < 4) optTexts.push("");

  const diagrams: Array<{ mime: string; b64: string; alt: string }> = [];
  const text = String(q.text ?? "").replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (w, alt, payload) => {
    const trimmed = payload.trim();
    if (/^(https?:\/\/|\/[a-z])/i.test(trimmed) && !/^\/9j\//.test(trimmed)) return w;
    const dm = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(trimmed);
    let mime = "image/png", b64 = trimmed.replace(/\s+/g, "");
    if (dm) { mime = dm[1]; b64 = dm[2]; } else { mime = sniffMime(b64); }
    diagrams.push({ mime, b64, alt });
    return `[diagram ${diagrams.length}]`;
  }).trim();

  const row = {
    subject_id, chapter_id, text,
    options: optTexts,
    correct_index: Number(q.correct_index ?? 0),
    explanation: q.explanation ?? null,
    difficulty: String(q.difficulty ?? "medium").toLowerCase(),
    source: String(q.source ?? "NCERT"),
    marks_correct: Number(q.marks_correct ?? 4),
    marks_wrong: Number(q.marks_wrong ?? -1),
    is_pyq: Boolean(q.is_pyq),
    pyq_year: q.pyq_year ?? null,
    question_type: q.question_type ?? (diagrams.length || optImgs.length ? "diagram" : "standard"),
    topic: q.topic ?? null,
    sub_topic: q.sub_topic ?? null,
  };
  const { data: ins, error } = await admin.from("questions").insert(row).select("id").maybeSingle();
  if (error) { console.error("insert error:", error.message); process.exit(1); }
  const qid = ins!.id;
  console.log("inserted question", qid);

  for (const d of diagrams) {
    const { error: de } = await admin.from("question_diagrams").insert({ question_id: qid, mime: d.mime, data: b64ToBytea(d.b64), prompt: d.alt || null });
    if (de) console.error("diagram err:", de.message);
  }
  for (const oi of optImgs) {
    const { error: oe } = await admin.from("question_option_images").insert({ question_id: qid, option_index: oi.index, mime: oi.mime, data: b64ToBytea(oi.b64) });
    if (oe) console.error("opt img err:", oe.message);
  }
  console.log(`  → ${diagrams.length} diagrams, ${optImgs.length} option images`);
}
