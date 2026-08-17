// Lenient JSON parsing for bulk uploads.
// Handles: BOM, trailing commas, // and /* */ comments, single quotes,
// smart quotes, RAW control chars inside string literals (wrapped base64),
// and UNQUOTED string values for well-known keys (e.g. `"text": \n\nWhich...")
// that LLMs sometimes emit.
// Does NOT touch backslashes inside strings — LaTeX (\frac, \vec, ...) survives.
const AUTO_QUOTE_KEYS = new Set([
  "text",
  "explanation",
  "chapter",
  "subject",
  "topic",
  "sub_topic",
  "title",
  "description",
  "difficulty",
  "source",
  "question_type",
]);

export function parseLenientJson(input: string): unknown {
  const s = input.replace(/^\uFEFF/, "").trim();
  try { return JSON.parse(s); } catch { /* fall through */ }

  const normalized = normalizeMarkdownImages(s);
  const out = transform(normalized);
  return JSON.parse(out);
}

// Bulk LLM output often emits option values like `"![diagram](/9j/base64...\n...)`
// where the base64 is wrapped across many lines AND the closing `"` is missing.
// Normalize such markdown images by stripping whitespace inside the parentheses
// and ensuring a closing quote follows so the surrounding JSON string parses.
function normalizeMarkdownImages(src: string): string {
  // 1. Strip newlines/spaces inside base64 body — base64 has no `)` char.
  let out = src.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (_, p, body: string, s) => {
    const clean = body.replace(/\s+/g, "");
    return p + clean + s;
  });
  // 2. Ensure a closing `"` after `![alt](payload)`. LLM output frequently
  //    drops the closing quote: `"![diagram](base64)` then a raw newline before
  //    the next `"`. Insert `"` unless the next char is already `"`, `,`, or `]`.
  out = out.replace(/(!\[[^\]]*\]\([^)]+\))(?=[^"\],])/g, '$1"');
  return out;
}



function transform(s: string): string {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];

    // Line comment
    if (c === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    // Block comment
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Check `"key":` with unquoted value for known keys — must come BEFORE
    // the normal string-literal branch so the key's `"..."` isn't consumed first.
    if (c === '"') {
      const km = matchKeyHere(s, i);
      if (km && AUTO_QUOTE_KEYS.has(km.key)) {
        const valueStart = km.end;
        const first = s[valueStart];
        // Treat `[foo](...)` (markdown link/image WITHOUT `!` prefix) as an unquoted string —
        // it looks like a JSON array to a naive parser but is really broken markdown.
        const looksLikeMarkdownLink = first === "[" && /^\[[^\]\n]*\]\(/.test(s.slice(valueStart));
        const isValid = !looksLikeMarkdownLink && (
          first === '"' || first === "'" || first === "\u201C" || first === "\u2018" ||
          first === "[" || first === "{" ||
          first === "t" || first === "f" || first === "n" || first === "-" ||
          (first >= "0" && first <= "9"));
        if (!isValid) {
          const { value, end } = consumeUnquotedValue(s, valueStart);
          out += s.slice(i, valueStart);
          const escaped = value
            .trim()
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "\\r")
            .replace(/\t/g, "\\t");
          out += `"${escaped}"`;
          i = end;
          continue;
        }
      }
    }

    // String literal — escape raw control chars, normalize smart quotes.
    if (c === '"' || c === "'" || c === "\u201C" || c === "\u2018") {

      const closing =
        c === '"' ? '"' :
        c === "'" ? "'" :
        c === "\u201C" ? "\u201D" : "\u2019";
      i++;
      let body = "";
      while (i < n) {
        const cc = s[i];
        if (cc === "\\") { body += cc + (s[i + 1] ?? ""); i += 2; continue; }
        if (cc === closing) { i++; break; }
        if (cc === "\n") body += "\\n";
        else if (cc === "\r") body += "\\r";
        else if (cc === "\t") body += "\\t";
        else body += cc;
        i++;
      }
      if (closing === "'" || closing === "\u2019") body = body.replace(/\\'/g, "'").replace(/"/g, '\\"');
      out += `"${body}"`;
      continue;
    }




    out += c;
    i++;
  }
  // Trailing commas
  out = out.replace(/,(\s*[}\]])/g, "$1");
  // Insert commas the source dropped between array/object elements.
  return insertMissingCommas(out);
}

function insertMissingCommas(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  let lastValue = false; // was the previous non-ws token a value/close-bracket?
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { out += c; i++; continue; }
    // String
    if (c === '"') {
      // If previous token was a value and we're starting another string value, insert `,`.
      if (lastValue) out += ",";
      const start = i;
      i++;
      while (i < n) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === '"') { i++; break; }
        i++;
      }
      out += src.slice(start, i);
      lastValue = true;
      continue;
    }
    if (c === "{" || c === "[") {
      if (lastValue) out += ",";
      out += c; i++; lastValue = false; continue;
    }
    if (c === "}" || c === "]") {
      out += c; i++; lastValue = true; continue;
    }
    if (c === "," || c === ":") {
      out += c; i++; lastValue = false; continue;
    }
    // number / true / false / null
    if (/[-0-9tfn]/.test(c)) {
      if (lastValue) out += ",";
      const start = i;
      while (i < n && /[-+0-9eE.a-zA-Z]/.test(src[i])) i++;
      out += src.slice(start, i);
      lastValue = true;
      continue;
    }
    out += c; i++;
  }
  return out;
}


function matchKeyHere(s: string, i: number): { key: string; end: number } | null {
  if (s[i] !== '"') return null;
  const m = /^"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:\s*/.exec(s.slice(i));
  if (!m) return null;
  return { key: m[1], end: i + m[0].length };
}

function consumeUnquotedValue(s: string, start: number): { value: string; end: number } {
  let j = start;
  let depth = 0;
  let value = "";
  while (j < s.length) {
    const c = s[j];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) {
      const rest = s.slice(j + 1);
      if (/^\s*"[a-zA-Z_][a-zA-Z0-9_]*"\s*:/.test(rest) || /^\s*[}\]]/.test(rest)) break;
    }
    value += c;
    j++;
  }
  // The AI often drops the opening `"` but keeps the closing `"` before comma:
  //   "text": \n\nWhich...RNA?",
  // Trim a trailing stray double quote so it does not double up after escape.
  const trimmed = value.replace(/"\s*$/, "");
  return { value: trimmed, end: j };
}

export async function chunkedInsert<T>(
  rows: T[],
  size: number,
  insert: (chunk: T[]) => Promise<{ inserted: number; error?: string }>,
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    try {
      const r = await insert(chunk);
      inserted += r.inserted;
      if (r.error) errors.push(r.error);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { inserted, errors };
}
