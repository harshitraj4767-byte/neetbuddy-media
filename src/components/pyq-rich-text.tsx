import { RichText } from "@/components/rich-text";

/**
 * Marks-format NEET PYQ questions ship as HTML strings that mix:
 *   - <p>, <br>, <div>          → paragraph/line breaks
 *   - <img src="..."> / <img /> → question or option images (CDN-hosted)
 *   - <sub>, <sup>              → chemical/math notation
 *   - LaTeX runs like  $..$  and  $$..$$  embedded inside the HTML
 *
 * We normalize the HTML into the plain string that <RichText/> already
 * understands: markdown images `![](url)`, real newlines, unicode
 * sub/sup for simple digits, and untouched $...$ LaTeX runs.
 */
export function PyqRichText({ html, className }: { html?: string | null; className?: string }) {
  const source = html ?? "";
  // NEETIQ papers embed diagrams as inline SVG containing a base64 PNG. The
  // generic HTML-to-text normalizer strips SVG tags, so pass these records to
  // RichText intact; it already renders trusted SVG and mixed LaTeX safely.
  const content = /<svg\b/i.test(source) ? source : htmlToRichText(source);
  return <RichText className={className}>{content}</RichText>;
}

const SUB_MAP: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};
const SUP_MAP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  "n": "ⁿ", "i": "ⁱ",
};

function mapChars(text: string, map: Record<string, string>, fallbackWrap: (t: string) => string) {
  const all = [...text].every((ch) => ch in map);
  if (all) return [...text].map((ch) => map[ch]).join("");
  return fallbackWrap(text);
}

export function htmlToRichText(input: string): string {
  if (!input) return "";
  let s = input;

  // Protect LaTeX runs — we don't want tag stripping to touch them.
  const stash: string[] = [];
  const protect = (re: RegExp) => {
    s = s.replace(re, (m) => {
      stash.push(m);
      return `\u0000${stash.length - 1}\u0000`;
    });
  };
  protect(/\$\$[\s\S]+?\$\$/g);
  protect(/\$[^$\n]+?\$/g);
  protect(/\\\([^\n]+?\\\)/g);
  protect(/\\\[[\s\S]+?\\\]/g);

  // <img ...> → markdown image (RichText renders it)
  s = s.replace(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi, (_, a, b) => {
    const src = a || b || "";
    return `\n\n![](${src})\n\n`;
  });

  // <br> → newline
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // block-ish tags → newline padding
  s = s.replace(/<\/?(p|div|section|article|li|tr|table|thead|tbody|h[1-6])(\s[^>]*)?>/gi, "\n");
  s = s.replace(/<li(\s[^>]*)?>/gi, "\n• ");

  // <sub>...</sub>, <sup>...</sup> → unicode where possible, else _{...}/^{...}
  s = s.replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, t) =>
    mapChars(stripTags(t).trim(), SUB_MAP, (raw) => `_{${raw}}`),
  );
  s = s.replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, t) =>
    mapChars(stripTags(t).trim(), SUP_MAP, (raw) => `^{${raw}}`),
  );

  // <b>/<strong>, <i>/<em> → markdown
  s = s.replace(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi, "**$1**");
  s = s.replace(/<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/gi, "*$1*");

  // strip remaining tags
  s = stripTags(s);

  // decode common html entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&deg;/g, "°")
    .replace(/&plusmn;/g, "±")
    .replace(/&times;/g, "×")
    .replace(/&divide;/g, "÷")
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  // restore stashed LaTeX runs
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? "");

  // collapse runs of blank lines but keep paragraph breaks
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
}
