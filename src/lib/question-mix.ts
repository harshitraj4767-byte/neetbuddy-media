// Question mixing for practice sets (subject-wise quiz, generated tests).
//
// Goal: high-value question formats — multi-statement, numerical, diagram,
// assertion & reason, match-the-columns — should appear EARLY, alternating
// between formats, and be properly interleaved with quick one-liner MCQs so a
// set never feels like "20 easy ones then 20 hard ones".

export type MixableQuestion = {
  id: string;
  text?: string | null;
  qtype?: string | null;
  question_image_url?: string | null;
};

export type QuestionFormat =
  | "diagram"
  | "assertion_reason"
  | "match_columns"
  | "multi_statement"
  | "numerical"
  | "one_liner";

/** Rich formats, in the priority order the user asked for. */
export const RICH_FORMATS: QuestionFormat[] = [
  "multi_statement",
  "numerical",
  "diagram",
  "assertion_reason",
  "match_columns",
];

export const FORMAT_LABELS: Record<QuestionFormat, string> = {
  diagram: "Diagram / figure based",
  assertion_reason: "Assertion & Reason",
  match_columns: "Match the columns",
  multi_statement: "Multi-statement",
  numerical: "Numerical",
  one_liner: "One-liner MCQ",
};

const IMG_RE = /!\[[^\]]*\]\([^)]+\)|<img\b|\[diagram/i;
const STATEMENT_RE =
  /statement\s*[-–—:]?\s*(?:i{1,3}\b|[1-4]\b|[a-d]\b)|following\s+statements|assertion\s*\(a\)|\bs1\b.*\bs2\b/i;
const MATCH_RE = /match\s+(?:the\s+)?(?:following|columns?|list)|column\s*[-–—]?\s*i\b|list\s*[-–—]?\s*i\b/i;
const AR_RE = /assertion\s*(?:\(a\)|:|\b).*reason|reason\s*\(r\)/is;
const NUMERIC_RE =
  /\b(?:calculate|compute|evaluate|find\s+the\s+value|what\s+is\s+the\s+value|how\s+many|the\s+ratio\s+of)\b|\d+(?:\.\d+)?\s*(?:g|kg|mg|mol|m\/s|ms\^?-?1|cm|mm|km|nm|j|kj|cal|k\b|°c|atm|pa|n\b|hz|ev|ml|l\b|%)/i;

/** Classify a question into a display format bucket. */
export function classifyQuestion(q: MixableQuestion): QuestionFormat {
  const type = (q.qtype ?? "").toLowerCase();
  const text = q.text ?? "";

  if (q.question_image_url || type.includes("graph") || type.includes("figure") || IMG_RE.test(text)) {
    return "diagram";
  }
  if (type.includes("assertion") || AR_RE.test(text)) return "assertion_reason";
  if (type.includes("match") || MATCH_RE.test(text)) return "match_columns";
  if (type.includes("type-2") || type.includes("type-3") || STATEMENT_RE.test(text)) {
    return "multi_statement";
  }
  if (NUMERIC_RE.test(text)) return "numerical";
  return "one_liner";
}

/** Small deterministic PRNG so the same set keeps the same order across visits. */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Orders questions so rich formats lead and rotate between each other, with
 * one-liners woven in (2 rich : 1 one-liner) until the rich pool runs out.
 */
export function mixQuestions<T extends MixableQuestion>(questions: T[], seed = "mix"): T[] {
  const rnd = seededRandom(seed);
  const buckets = new Map<QuestionFormat, T[]>();
  for (const q of questions) {
    const f = classifyQuestion(q);
    if (!buckets.has(f)) buckets.set(f, []);
    buckets.get(f)!.push(q);
  }
  for (const [k, v] of buckets) buckets.set(k, shuffle(v, rnd));

  // Round-robin across the rich buckets so consecutive rich questions differ
  // in format instead of arriving in blocks.
  const richQueue: T[] = [];
  const richLists = RICH_FORMATS.map((f) => buckets.get(f) ?? []).filter((l) => l.length);
  for (let i = 0; richLists.some((l) => i < l.length); i++) {
    for (const list of richLists) if (i < list.length) richQueue.push(list[i]);
  }

  const simpleQueue = buckets.get("one_liner") ?? [];
  const out: T[] = [];
  let ri = 0;
  let si = 0;
  while (ri < richQueue.length || si < simpleQueue.length) {
    for (let k = 0; k < 2 && ri < richQueue.length; k++) out.push(richQueue[ri++]);
    if (si < simpleQueue.length) out.push(simpleQueue[si++]);
    // Once rich questions are exhausted, dump the rest of the one-liners.
    if (ri >= richQueue.length) {
      while (si < simpleQueue.length) out.push(simpleQueue[si++]);
    }
  }
  return out;
}

/** Counts per format, used to show the user what a filter will produce. */
export function formatBreakdown(questions: MixableQuestion[]): Record<QuestionFormat, number> {
  const out = {
    multi_statement: 0,
    numerical: 0,
    diagram: 0,
    assertion_reason: 0,
    match_columns: 0,
    one_liner: 0,
  } as Record<QuestionFormat, number>;
  for (const q of questions) out[classifyQuestion(q)]++;
  return out;
}
