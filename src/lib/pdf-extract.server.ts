// Server-only: extract questions from a PDF using Lovable AI Gateway (Gemini PDF understanding),
// and slice each page into a single-page PDF that we save as the diagram bytes.
import { PDFDocument } from "pdf-lib";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type ExtractedOption = {
  text: string;
  image_base64?: string | null;
  mime?: string | null;
};

export type ExtractedQuestion = {
  page: number;
  text: string;
  options: ExtractedOption[];
  correct_index: number | null;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  source?: string;
  chapter?: string;
  subject?: string;
  topic?: string;
  sub_topic?: string;
  is_pyq?: boolean;
  pyq_year?: number | null;
  marks_correct?: number;
  marks_wrong?: number;
  question_type?: "standard" | "diagram";
  has_diagram?: boolean;
};

const SYSTEM = `You are an expert exam question extractor for NEET / JEE preparation.
The user will send you a PDF of exam questions (may include diagrams / figures / graphs).
Return STRICT JSON with this shape:
{
  "questions": [
    {
      "page": <1-based page number where the question appears>,
      "text": "<question text in Markdown, preserve LaTeX as $...$ or $$...$$>",
      "options": [
        { "text": "<option text or empty if the option is purely an image>" },
        ... (usually 4)
      ],
      "correct_index": <0..3 or null if not shown>,
      "explanation": "<optional explanation in Markdown>",
      "difficulty": "easy" | "medium" | "hard",
      "source": "<e.g. 'NCERT Class XI', 'JEE PYQ (2019)'>",
      "chapter": "<chapter name if inferrable>",
      "subject": "<Physics | Chemistry | Biology if inferrable>",
      "topic": "<topic if inferrable>",
      "sub_topic": "<sub-topic if inferrable>",
      "is_pyq": <true/false>,
      "pyq_year": <int or null>,
      "marks_correct": 4,
      "marks_wrong": -1,
      "question_type": "standard" | "diagram",
      "has_diagram": <true if the question or any of its options contain a figure/graph/circuit/image, else false>
    }
  ]
}
Rules:
- Never invent an answer key. If not shown, set "correct_index": null.
- Preserve math with LaTeX.
- Set "question_type": "diagram" if the question or any option requires an image to be understood.
- Set "has_diagram": true whenever a figure is part of the question. We will attach the source page image separately.
- Return ONLY valid JSON. No prose. No markdown fences.`;

const DIAGRAM_SYSTEM = `You are an expert NEET / JEE diagram-based MCQ creator.
The user will send a PDF containing diagrams, graphs, labelled figures, apparatus, circuits, biological structures, or flow charts.
Create STRICT JSON with this shape:
{
  "questions": [
    {
      "page": <1-based page number of the diagram/graph used>,
      "text": "<MCQ stem in Markdown. Refer to the attached diagram/graph and labelled parts such as P, Q, R, S.>",
      "options": [{ "text": "<option A>" }, { "text": "<option B>" }, { "text": "<option C>" }, { "text": "<option D>" }],
      "correct_index": <0..3>,
      "explanation": "<short explanation in Markdown, ending with **Answer: Option X.**>",
      "difficulty": "easy" | "medium" | "hard",
      "source": "Diagram upload",
      "chapter": "<chapter name if inferrable>",
      "subject": "<Physics | Chemistry | Biology if inferrable>",
      "topic": "<topic if inferrable>",
      "sub_topic": "<sub-topic if inferrable>",
      "is_pyq": false,
      "pyq_year": null,
      "marks_correct": 4,
      "marks_wrong": -1,
      "question_type": "diagram",
      "has_diagram": true
    }
  ]
}
Question variety:
- Identify labelled part / name / function.
- Choose correct or incorrect statement about a labelled part.
- Graph interpretation: slope, intercept, area, trend, labelled point/segment.
- Match labelled parts with names/functions.
- Experimental apparatus or circuit interpretation.
Rules:
- Make as many high-quality questions as the PDF supports, up to 12.
- Do not invent labels that are not visible unless the diagram clearly supports adding simple P/Q/R/S references in the stem.
- Exactly 4 options and exactly one correct answer.
- Preserve math with LaTeX.
- Return ONLY valid JSON. No prose. No markdown fences.`;

function parseQuestionsJson(raw: unknown): any[] {
  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    const m = String(raw).match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = m ? JSON.parse(m[1]) : { questions: [] };
  }
  return Array.isArray(parsed?.questions) ? parsed.questions : [];
}

function normalizeExtractedQuestions(list: any[], forceDiagram = false): ExtractedQuestion[] {
  return list.map((q: any) => ({
    page: Number(q.page) || 1,
    text: String(q.text ?? ""),
    options: Array.isArray(q.options)
      ? q.options.map((o: any) =>
          typeof o === "string" ? { text: o } : { text: String(o?.text ?? "") },
        )
      : [],
    correct_index: typeof q.correct_index === "number" ? q.correct_index : null,
    explanation: q.explanation ?? "",
    difficulty: q.difficulty ?? "medium",
    source: q.source ?? (forceDiagram ? "Diagram upload" : ""),
    chapter: q.chapter ?? "",
    subject: q.subject ?? "",
    topic: q.topic ?? "",
    sub_topic: q.sub_topic ?? "",
    is_pyq: !!q.is_pyq,
    pyq_year: q.pyq_year ?? null,
    marks_correct: q.marks_correct ?? 4,
    marks_wrong: q.marks_wrong ?? -1,
    question_type: forceDiagram || q.question_type === "diagram" ? "diagram" : "standard",
    has_diagram: forceDiagram || !!q.has_diagram,
  }));
}

export async function extractQuestionsFromPdf(pdfBytes: Uint8Array): Promise<ExtractedQuestion[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const base64 = Buffer.from(pdfBytes).toString("base64");

  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all questions from this PDF." },
          {
            type: "file",
            file: {
              filename: "questions.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${err}`);
  }
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  return normalizeExtractedQuestions(parseQuestionsJson(raw));
}

export async function createDiagramQuestionsFromPdf(pdfBytes: Uint8Array): Promise<ExtractedQuestion[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const base64 = Buffer.from(pdfBytes).toString("base64");
  const body = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: DIAGRAM_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Create NEET-quality diagram/graph based MCQs from this PDF. Use the PDF pages as the attached diagrams." },
          {
            type: "file",
            file: {
              filename: "diagrams.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${err}`);
  }
  const data: any = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  return normalizeExtractedQuestions(parseQuestionsJson(raw), true).filter(
    (q) => q.text && q.options.length >= 4 && q.correct_index != null,
  );
}

/**
 * Extract a single page as a standalone PDF (bytes). We use this as the "diagram"
 * for a question when the page contains a figure. Runs on Cloudflare Workers.
 */
export async function extractPageAsPdf(pdfBytes: Uint8Array, pageIndex0: number): Promise<Uint8Array> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const dst = await PDFDocument.create();
  const idx = Math.max(0, Math.min(pageIndex0, src.getPageCount() - 1));
  const [copied] = await dst.copyPages(src, [idx]);
  dst.addPage(copied);
  return dst.save();
}
