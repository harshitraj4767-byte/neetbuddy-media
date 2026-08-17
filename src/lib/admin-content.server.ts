import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminOptionInput =
  | string
  | {
      text?: string;
      image_base64?: string | null;
      mime?: string | null;
    };

export type AdminDiagramInput = {
  data_base64: string;
  mime: string;
  prompt?: string | null;
};

export type AdminQuestionInput = {
  text: string;
  options: AdminOptionInput[];
  correct_index: number;
  difficulty?: string;
  source?: string;
  marks_correct?: number;
  marks_wrong?: number;
  explanation?: string | null;
  subject?: string;
  chapter?: string;
  topic?: string | null;
  sub_topic?: string | null;
  question_type?: string;
  is_pyq?: boolean;
  pyq_year?: number | null;
  diagrams?: AdminDiagramInput[];
};

export type ChapterQuizInput = {
  subject: string;
  chapter: string;
  title?: string;
  description?: string;
  duration_min?: number;
  difficulty?: string;
  source?: string;
  questions: AdminQuestionInput[];
};

export type ChapterImportInput = {
  subject: string;
  name: string;
  class?: number | null;
  order_index?: number;
};

const SUBJECT_NAMES: Record<string, string> = {
  physics: "Physics",
  chemistry: "Chemistry",
  botany: "Botany",
  zoology: "Zoology",
  biology: "Biology",
};

function norm(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function displaySubject(value: string) {
  const key = norm(value);
  return SUBJECT_NAMES[key] ?? value.trim().replace(/\w\S*/g, (s) => s[0].toUpperCase() + s.slice(1).toLowerCase());
}

export async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export async function logAdminAction(userId: string, action: string, target: string | null, meta: Record<string, unknown>) {
  await supabaseAdmin.from("admin_actions").insert({ user_id: userId, action, target, meta: meta as never });
}

export async function ensureSubject(name: string) {
  const clean = displaySubject(name);
  if (!clean) throw new Error("Subject is required");
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("subjects")
    .select("id,name")
    .ilike("name", clean)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return { id: existing.id, name: existing.name };

  const { data, error } = await supabaseAdmin
    .from("subjects")
    .insert({ name: clean })
    .select("id,name")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? `Could not create subject ${clean}`);
  return { id: data.id, name: data.name };
}

export async function ensureChapter(subjectId: string, name: string, klass?: number | null, orderIndex = 0) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Chapter is required");
  const { data: chapters, error: findErr } = await supabaseAdmin
    .from("chapters")
    .select("id,name")
    .eq("subject_id", subjectId);
  if (findErr) throw new Error(findErr.message);
  const existing = (chapters ?? []).find((chapter) => norm(chapter.name) === norm(clean));
  if (existing?.id) return { id: existing.id, name: existing.name, created: false };

  const { data, error } = await supabaseAdmin
    .from("chapters")
    .insert({ subject_id: subjectId, name: clean, class: klass ?? null, order_index: orderIndex })
    .select("id,name")
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? `Could not create chapter ${clean}`);
  return { id: data.id, name: data.name, created: true };
}




// Detect `![alt](payload)` where `payload` is base64 (no protocol / no leading `/`).
// Returns { text, image_base64, mime } — text is what to render alongside (may be empty).
function extractInlineImage(raw: string): { text: string; image_base64: string; mime: string } | null {
  const m = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(raw);
  if (!m) return null;
  const payload = m[2].trim();
  if (/^(https?:\/\/|\/)/i.test(payload)) return null;
  // Data-URL: data:image/png;base64,XXXX
  const dataUrl = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(payload);
  if (dataUrl) return { text: m[1], mime: dataUrl[1] || "image/png", image_base64: dataUrl[2] };
  // Bare base64 — sniff mime from magic bytes.
  const clean = payload.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(clean)) return null;
  const mime = sniffMime(clean);
  return { text: m[1], mime, image_base64: clean };
}

function sniffMime(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBORw")) return "image/png";
  if (b64.startsWith("R0lGOD")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

export type CleanQuestionResult = ReturnType<typeof cleanQuestion>;

export function cleanQuestion(q: AdminQuestionInput, subjectId: string | null, chapterId: string | null) {
  const rawOpts = Array.isArray(q.options) ? q.options : [];
  const optionTexts: string[] = [];
  const optionImages: Array<{ index: number; image_base64: string; mime: string }> = [];
  rawOpts.slice(0, 4).forEach((opt, i) => {
    if (typeof opt === "string") {
      const inline = extractInlineImage(opt);
      if (inline) {
        optionImages.push({ index: i, image_base64: inline.image_base64, mime: inline.mime });
        optionTexts.push(inline.text.trim() || "[image]");
      } else {
        optionTexts.push(opt.trim());
      }
    } else {
      const text = String(opt?.text ?? "").trim();
      if (opt?.image_base64) {
        optionImages.push({
          index: i,
          image_base64: String(opt.image_base64),
          mime: String(opt.mime ?? "image/png"),
        });
      }
      optionTexts.push(text || (opt?.image_base64 ? "[image]" : ""));
    }
  });
  while (optionTexts.length < 4) optionTexts.push("");

  // Extract inline `![...](base64)` images from question text → diagrams.
  const extraDiagrams: AdminDiagramInput[] = [];
  let cleanedText = q.text?.trim() ?? "";
  cleanedText = cleanedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (whole, alt: string, payload: string) => {
    const trimmed = payload.trim();
    if (/^(https?:\/\/|\/)/i.test(trimmed)) return whole; // keep external/absolute
    const dm = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(trimmed);
    let mime = "image/png";
    let b64 = trimmed.replace(/\s+/g, "");
    if (dm) { mime = dm[1] || mime; b64 = dm[2]; }
    if (!/^[A-Za-z0-9+/=]{16,}$/.test(b64)) return whole;
    mime = dm ? mime : sniffMime(b64);
    extraDiagrams.push({ data_base64: b64, mime, prompt: alt || null });
    return `[diagram ${extraDiagrams.length}]`;
  });

  if (!cleanedText) throw new Error("Question text is required");
  const hasEmpty = optionTexts.some((t, i) => !t && !optionImages.find((oi) => oi.index === i));
  if (hasEmpty) throw new Error(`Question "${cleanedText.slice(0, 40)}..." has empty options`);
  const correctIndex = Number(q.correct_index ?? 0);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw new Error("Correct option must be 0, 1, 2, or 3");
  const diagrams = [...(Array.isArray(q.diagrams) ? q.diagrams : []), ...extraDiagrams];
  return {
    row: {
      subject_id: subjectId,
      chapter_id: chapterId,
      text: cleanedText,
      options: optionTexts,
      correct_index: correctIndex,
      explanation: q.explanation ? String(q.explanation) : null,
      difficulty: String(q.difficulty ?? "medium").toLowerCase(),
      source: String(q.source ?? "NCERT"),
      marks_correct: Number(q.marks_correct ?? 4),
      marks_wrong: Number(q.marks_wrong ?? -1),
      is_pyq: Boolean(q.is_pyq || q.pyq_year != null || String(q.source ?? "").toUpperCase().includes("PYQ")),
      pyq_year: q.pyq_year == null ? null : Number(q.pyq_year),
      question_type: q.question_type ?? (diagrams.length || optionImages.length ? "diagram" : "standard"),
      topic: q.topic ?? null,
      sub_topic: q.sub_topic ?? null,
    },
    optionImages,
    diagrams,
  };

}

function b64ToBytea(b64: string): string {
  // Strip data URL prefix if present
  const clean = b64.replace(/^data:[^,]+,/, "");
  const bytes = Buffer.from(clean, "base64");
  return "\\x" + bytes.toString("hex");
}

export async function saveQuestionAssets(
  questionId: string,
  diagrams: AdminDiagramInput[],
  optionImages: Array<{ index: number; image_base64: string; mime: string }>,
) {
  const admin = supabaseAdmin as any;
  for (const d of diagrams) {
    if (!d?.data_base64) continue;
    await admin.from("question_diagrams").insert({
      question_id: questionId,
      mime: d.mime || "image/png",
      data: b64ToBytea(d.data_base64),
      prompt: d.prompt ?? null,
    });
  }
  for (const oi of optionImages) {
    await admin.from("question_option_images").insert({
      question_id: questionId,
      option_index: oi.index,
      mime: oi.mime,
      data: b64ToBytea(oi.image_base64),
    });
  }
}

export async function insertQuestions(cleaned: CleanQuestionResult[]) {
  const ids: string[] = [];
  const errors: string[] = [];
  const admin = supabaseAdmin as any;
  for (const c of cleaned) {
    const { data, error } = await admin
      .from("questions")
      .insert(c.row)
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      if (error) errors.push(error.message);
      continue;
    }
    ids.push(data.id);
    try {
      await saveQuestionAssets(data.id, c.diagrams, c.optionImages);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { ids, errors: Array.from(new Set(errors)) };
}
