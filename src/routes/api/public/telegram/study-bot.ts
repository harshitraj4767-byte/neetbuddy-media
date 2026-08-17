import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { PDFDocument, degrees } from "pdf-lib";
import { createDiagramQuestionsFromPdf, extractQuestionsFromPdf, extractPageAsPdf } from "@/lib/pdf-extract.server";
import { cleanQuestion, ensureChapter, ensureSubject, insertQuestions } from "@/lib/admin-content.server";

const TG_API = "https://api.telegram.org";

const MATERIAL_TYPES = [
  { value: "mind_map", label: "Mind Maps" },
  { value: "formula_sheet", label: "Formula Sheets" },
  { value: "short_notes", label: "Short Notes" },
  { value: "revision_notes", label: "Revision Notes" },
  { value: "ncert_solutions", label: "NCERT Solutions" },
] as const;

type MType = typeof MATERIAL_TYPES[number]["value"];

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-study-bot:${token}`).digest("base64url");
}
function safeEqual(a: string, b: string) {
  const A = Buffer.from(a), B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function tg(botToken: string, method: string, body: unknown) {
  const res = await fetch(`${TG_API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function reply(botToken: string, chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg(botToken, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

function materialKeyboard() {
  return {
    inline_keyboard: MATERIAL_TYPES.map((t) => [{ text: t.label, callback_data: `mt:${t.value}` }]),
  };
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}
function scoreMatch(hay: string, needle: string) {
  if (!hay || !needle) return 0;
  if (hay === needle) return 1000;
  if (hay.includes(needle)) return 500 + needle.length;
  const words = needle.split(" ").filter((w) => w.length > 2);
  let s = 0;
  for (const w of words) if (hay.includes(w)) s += w.length * 2;
  return s;
}

async function findChapter(supabaseAdmin: any, filename: string) {
  const norm = normalize(filename);
  const { data: chapters } = await supabaseAdmin
    .from("chapters")
    .select("id,name,subject_id,subjects(name)");
  if (!chapters?.length) return null;
  let best: { row: any; score: number } | null = null;
  for (const c of chapters) {
    const chScore = scoreMatch(norm, normalize(c.name));
    const subjScore = c.subjects?.name ? scoreMatch(norm, normalize(c.subjects.name)) * 0.3 : 0;
    const score = chScore + subjScore;
    if (score > 0 && (!best || score > best.score)) best = { row: c, score };
  }
  return best && best.score >= 6 ? best.row : null;
}

async function watermarkPdf(pdfBytes: Uint8Array, logoBytes: Uint8Array) {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const png = await doc.embedPng(logoBytes);
  const pages = doc.getPages();
  for (const p of pages) {
    const { width, height } = p.getSize();
    const targetW = Math.min(width, height) * 0.6;
    const ratio = png.width / png.height;
    const w = targetW;
    const h = w / ratio;
    p.drawImage(png, {
      x: (width - w) / 2,
      y: (height - h) / 2,
      width: w,
      height: h,
      opacity: 0.17,
      rotate: degrees(0),
    });
  }
  return doc.save();
}

async function downloadTelegramFile(botToken: string, fileId: string) {
  const info = await tg(botToken, "getFile", { file_id: fileId });
  const filePath = info?.result?.file_path;
  if (!filePath) throw new Error("Telegram getFile failed");
  const res = await fetch(`${TG_API}/file/bot${botToken}/${filePath}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadLogoBytes(_request: Request) {
  // Logo bytes are embedded at build time to avoid runtime fetches
  // (preview/dev static assets are gated behind auth and return 403).
  const { WATERMARK_LOGO_BASE64 } = await import("@/lib/watermark-logo.server");
  return new Uint8Array(Buffer.from(WATERMARK_LOGO_BASE64, "base64"));
}

async function processDocument(opts: {
  botToken: string;
  chatId: number;
  supabaseAdmin: any;
  materialType: MType;
  fileId: string;
  filename: string;
  request: Request;
}) {
  const { botToken, chatId, supabaseAdmin, materialType, fileId, filename, request } = opts;

  await reply(botToken, chatId, `⏳ Processing <b>${filename}</b>...`);

  const chapter = await findChapter(supabaseAdmin, filename);
  if (!chapter) {
    await reply(botToken, chatId, `❌ Could not detect chapter from <code>${filename}</code>. Rename with chapter name and resend.`);
    return;
  }

  const pdfBytes = await downloadTelegramFile(botToken, fileId);

  // Watermark is best-effort — never fail the whole flow because of it.
  let stamped: Uint8Array = pdfBytes;
  try {
    const logo = await loadLogoBytes(request);
    stamped = await watermarkPdf(pdfBytes, logo);
  } catch (e: any) {
    await reply(botToken, chatId, `⚠️ Watermark skipped (${e?.message ?? "logo error"}). Uploading original PDF.`);
    stamped = pdfBytes;
  }

  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  const path = `${chapter.subject_id}/${chapter.id}/${materialType}/${Date.now()}_${safeName}`;
  const upload = await supabaseAdmin.storage.from("study-materials").upload(path, stamped, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) throw new Error(`Upload failed: ${upload.error.message}`);

  const { data: pub } = supabaseAdmin.storage.from("study-materials").getPublicUrl(path);
  const pdfUrl = pub.publicUrl;
  const title = filename.replace(/\.pdf$/i, "").trim();

  const ins = await supabaseAdmin.from("study_materials").insert({
    subject_id: chapter.subject_id,
    chapter_id: chapter.id,
    material_type: materialType,
    title,
    pdf_url: pdfUrl,
    is_coming_soon: false,
    order_index: 0,
  });
  if (ins.error) throw new Error(`DB insert failed: ${ins.error.message}`);

  await reply(
    botToken,
    chatId,
    `✅ Saved <b>${title}</b>\n📚 ${chapter.subjects?.name ?? ""} · ${chapter.name}\n🏷️ ${materialType}`,
  );
}

async function handleExtract(opts: {
  botToken: string;
  chatId: number;
  supabaseAdmin: any;
  fileId: string;
  filename: string;
}) {
  const { botToken, chatId, supabaseAdmin, fileId, filename } = opts;
  await reply(botToken, chatId, `🔎 Extracting questions from <b>${filename}</b>…`);
  const pdfBytes = await downloadTelegramFile(botToken, fileId);
  const extracted = await extractQuestionsFromPdf(pdfBytes);
  if (!extracted.length) {
    await reply(botToken, chatId, "❌ No questions detected in this PDF.");
    return;
  }

  let ok = 0;
  const errors: string[] = [];
  for (const q of extracted) {
    try {
      let subjectId: string | null = null;
      let chapterId: string | null = null;
      if (q.subject) {
        subjectId = (await ensureSubject(q.subject)).id;
        if (q.chapter && subjectId) chapterId = (await ensureChapter(subjectId, q.chapter)).id;
      }
      const diagrams: { data_base64: string; mime: string; prompt?: string }[] = [];
      if (q.has_diagram) {
        try {
          const pageBytes = await extractPageAsPdf(pdfBytes, Math.max(0, (q.page ?? 1) - 1));
          diagrams.push({
            data_base64: Buffer.from(pageBytes).toString("base64"),
            mime: "application/pdf",
            prompt: `Page ${q.page} from ${filename}`,
          });
        } catch (e) {
          errors.push(`Page ${q.page} slice failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const cleaned = cleanQuestion(
        {
          text: q.text,
          options: q.options,
          correct_index: q.correct_index ?? 0,
          difficulty: q.difficulty,
          source: q.source || (q.is_pyq ? "PYQ" : "Extracted"),
          marks_correct: q.marks_correct,
          marks_wrong: q.marks_wrong,
          explanation: q.explanation ?? null,
          subject: q.subject,
          chapter: q.chapter,
          topic: q.topic || null,
          sub_topic: q.sub_topic || null,
          question_type: q.question_type,
          is_pyq: q.is_pyq,
          pyq_year: q.pyq_year ?? null,
          diagrams,
        },
        subjectId,
        chapterId,
      );
      const res = await insertQuestions([cleaned]);
      ok += res.ids.length;
      errors.push(...res.errors);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  const errTail = errors.length ? `\n⚠️ ${errors.length} issue(s): ${errors.slice(0, 3).join(" | ")}` : "";
  await reply(botToken, chatId, `✅ Inserted <b>${ok}/${extracted.length}</b> questions.${errTail}`);
}

async function saveExtractedQuestions(opts: {
  botToken: string;
  chatId: number;
  supabaseAdmin: any;
  pdfBytes: Uint8Array;
  filename: string;
  questions: Awaited<ReturnType<typeof extractQuestionsFromPdf>>;
  forceDiagram?: boolean;
}) {
  const { botToken, chatId, supabaseAdmin, pdfBytes, filename, questions, forceDiagram } = opts;
  let ok = 0;
  const errors: string[] = [];

  for (const group of chunks(questions, 3)) {
    const cleanedBatch: ReturnType<typeof cleanQuestion>[] = [];
    for (const q of group) {
      try {
        let subjectId: string | null = null;
        let chapterId: string | null = null;
        if (q.subject) {
          subjectId = (await ensureSubject(q.subject)).id;
          if (q.chapter && subjectId) chapterId = (await ensureChapter(subjectId, q.chapter)).id;
        }

        const pageBytes = await extractPageAsPdf(pdfBytes, Math.max(0, (q.page ?? 1) - 1));
        const diagrams = q.has_diagram || forceDiagram ? [{
          data_base64: Buffer.from(pageBytes).toString("base64"),
          mime: "application/pdf",
          prompt: `Page ${q.page} from ${filename}`,
        }] : [];

        cleanedBatch.push(cleanQuestion(
          {
            text: q.text,
            options: q.options,
            correct_index: q.correct_index ?? 0,
            difficulty: q.difficulty,
            source: q.source || (forceDiagram ? "Diagram upload" : q.is_pyq ? "PYQ" : "Extracted"),
            marks_correct: q.marks_correct,
            marks_wrong: q.marks_wrong,
            explanation: q.explanation ?? null,
            subject: q.subject,
            chapter: q.chapter,
            topic: q.topic || null,
            sub_topic: q.sub_topic || null,
            question_type: forceDiagram ? "diagram" : q.question_type,
            is_pyq: q.is_pyq,
            pyq_year: q.pyq_year ?? null,
            diagrams,
          },
          subjectId,
          chapterId,
        ));
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (cleanedBatch.length) {
      const res = await insertQuestions(cleanedBatch);
      ok += res.ids.length;
      errors.push(...res.errors);
    }
  }

  const errTail = errors.length ? `\n⚠️ ${errors.length} issue(s): ${errors.slice(0, 3).join(" | ")}` : "";
  await reply(botToken, chatId, `✅ Inserted <b>${ok}/${questions.length}</b> questions.${errTail}`);
}

async function handleDia(opts: {
  botToken: string;
  chatId: number;
  supabaseAdmin: any;
  fileId: string;
  filename: string;
}) {
  const { botToken, chatId, supabaseAdmin, fileId, filename } = opts;
  await reply(botToken, chatId, `🧬 Creating diagram-based questions from <b>${filename}</b>…`);
  const pdfBytes = await downloadTelegramFile(botToken, fileId);
  const questions = await createDiagramQuestionsFromPdf(pdfBytes);
  if (!questions.length) {
    await reply(botToken, chatId, "❌ Could not create diagram questions from this PDF. Send a clearer diagram/graph PDF.");
    return;
  }
  await saveExtractedQuestions({ botToken, chatId, supabaseAdmin, pdfBytes, filename, questions, forceDiagram: true });
}

async function handleUpdate(update: any, botToken: string, request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const msg = update.message ?? update.edited_message;
  const cq = update.callback_query;
  const from = msg?.from ?? cq?.from;
  const chat = msg?.chat ?? cq?.message?.chat;
  if (!from || !chat) return;

  // /extract
  if (msg?.text && /^\/extract\b/i.test(msg.text)) {
    await (supabaseAdmin as any).from("telegram_bot_sessions").upsert({
      chat_id: chat.id, telegram_user_id: from.id, state: "awaiting_extract_pdf", material_type: null, updated_at: new Date().toISOString(),
    });
    await reply(botToken, chat.id,
      "🧪 <b>Question Extractor</b>\n\nSend me a PDF of questions (with or without diagrams). I'll auto-detect questions, options, difficulty, chapter/topic, and diagram pages, then save them to the database.\n\nSend /start to go back to the study-materials flow.");
    return;
  }

  // /dia
  if (msg?.text && /^\/dia\b/i.test(msg.text)) {
    await (supabaseAdmin as any).from("telegram_bot_sessions").upsert({
      chat_id: chat.id, telegram_user_id: from.id, state: "awaiting_diagram_pdf", material_type: null, updated_at: new Date().toISOString(),
    });
    await reply(botToken, chat.id,
      "🧬 <b>Diagram Question Maker</b>\n\nSend me a PDF containing diagrams, graphs, labelled figures, circuits, apparatus, or biology structures. I'll create labelled-part, function, graph-reading, and statement-based MCQs, attach the diagram page, and save them to the database.\n\nSend /start to go back.");
    return;
  }

  // /start | /reset | /help
  if (msg?.text && /^\/(start|reset|help)/i.test(msg.text)) {
    await (supabaseAdmin as any).from("telegram_bot_sessions").upsert({
      chat_id: chat.id, telegram_user_id: from.id, state: "awaiting_type", material_type: null, updated_at: new Date().toISOString(),
    });
    await reply(botToken, chat.id,
      "👋 <b>NEET-Buddy Bot</b>\n\n• Pick a material type below and send PDFs — I'll watermark and save them.\n• Send /extract to auto-extract existing questions from a PDF.\n• Send /dia to create diagram/graph-based questions from a PDF.",
      { reply_markup: materialKeyboard() });
    return;
  }

  // Button tap
  if (cq?.data?.startsWith("mt:")) {
    const mt = cq.data.slice(3) as MType;
    if (!MATERIAL_TYPES.some((t) => t.value === mt)) return;
    await (supabaseAdmin as any).from("telegram_bot_sessions").upsert({
      chat_id: chat.id, telegram_user_id: from.id, state: "awaiting_docs", material_type: mt, updated_at: new Date().toISOString(),
    });
    await tg(botToken, "answerCallbackQuery", { callback_query_id: cq.id });
    const label = MATERIAL_TYPES.find((t) => t.value === mt)?.label;
    await reply(botToken, chat.id,
      `✅ Type set: <b>${label}</b>\n\nNow send PDFs (one or many). Filename should include the chapter name — e.g. <code>Kinematics - full mind map.pdf</code>. Send /reset to change type.`);
    return;
  }

  // Document
  const doc = msg?.document;
  if (doc) {
    if (!/pdf/i.test(doc.mime_type ?? "") && !/\.pdf$/i.test(doc.file_name ?? "")) {
      await reply(botToken, chat.id, "⚠️ Please send PDF files only.");
      return;
    }
    const { data: session } = await (supabaseAdmin as any)
      .from("telegram_bot_sessions").select("*").eq("chat_id", chat.id).maybeSingle();

    // Extract mode
    if (session?.state === "awaiting_extract_pdf") {
      try {
        await handleExtract({
          botToken, chatId: chat.id, supabaseAdmin,
          fileId: doc.file_id,
          filename: doc.file_name || `file-${doc.file_id}.pdf`,
        });
      } catch (e: any) {
        await reply(botToken, chat.id, `❌ Extract error: ${e?.message ?? String(e)}`);
      }
      return;
    }

    // Diagram question maker mode
    if (session?.state === "awaiting_diagram_pdf") {
      try {
        await handleDia({
          botToken, chatId: chat.id, supabaseAdmin,
          fileId: doc.file_id,
          filename: doc.file_name || `diagram-${doc.file_id}.pdf`,
        });
      } catch (e: any) {
        await reply(botToken, chat.id, `❌ /dia error: ${e?.message ?? String(e)}`);
      }
      return;
    }

    if (!session?.material_type) {
      await reply(botToken, chat.id, "❓ Send /start (study materials), /extract (extract existing questions), or /dia (make diagram questions) first.");
      return;
    }
    try {
      await processDocument({
        botToken, chatId: chat.id, supabaseAdmin, request,
        materialType: session.material_type,
        fileId: doc.file_id,
        filename: doc.file_name || `file-${doc.file_id}.pdf`,
      });
    } catch (e: any) {
      await reply(botToken, chat.id, `❌ Error: ${e?.message ?? String(e)}`);
    }
    return;
  }

  if (msg?.text && !/^\//.test(msg.text)) {
    await reply(botToken, chat.id, "Send /start to upload study materials, /extract to auto-extract questions from a PDF, or /dia to create diagram-based questions.");
  }
}

export const Route = createFileRoute("/api/public/telegram/study-bot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const botToken = process.env.TELEGRAM_STUDY_BOT_TOKEN;
        if (!botToken) return Response.json({ ok: false, error: "bot token missing" }, { status: 500 });

        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        if (action === "register") {
          const overrideUrl = url.searchParams.get("url");
          const publicHost =
            overrideUrl ??
            "https://project--54726c21-6f26-496e-b901-599acf665271-dev.lovable.app/api/public/telegram/study-bot";
          const webhookUrl = publicHost.startsWith("http") ? publicHost : `https://${publicHost}`;
          const secret = deriveSecret(botToken);
          const set = await tg(botToken, "setWebhook", {
            url: webhookUrl,
            secret_token: secret,
            allowed_updates: ["message", "edited_message", "callback_query"],
            drop_pending_updates: false,
          });
          await tg(botToken, "setMyCommands", { commands: [
            { command: "start", description: "Upload study materials" },
            { command: "extract", description: "Extract questions from a PDF" },
            { command: "dia", description: "Create diagram/graph questions from a PDF" },
            { command: "reset", description: "Reset current mode" },
          ] });
          const info = await tg(botToken, "getWebhookInfo", {});
          return Response.json({ ok: true, set, info, webhookUrl });
        }
        if (action === "info") {
          const info = await tg(botToken, "getWebhookInfo", {});
          const me = await tg(botToken, "getMe", {});
          return Response.json({ ok: true, me, info });
        }
        if (action === "delete") {
          const del = await tg(botToken, "deleteWebhook", { drop_pending_updates: false });
          return Response.json({ ok: true, del });
        }
        return Response.json({ ok: true, bot: "study-materials", hint: "?action=register|info|delete" });
      },
      POST: async ({ request }) => {
        const botToken = process.env.TELEGRAM_STUDY_BOT_TOKEN;
        if (!botToken) return new Response("bot token missing", { status: 500 });

        const expected = deriveSecret(botToken);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json();
        await handleUpdate(update, botToken, request);
        return Response.json({ ok: true });
      },
    },
  },
});
