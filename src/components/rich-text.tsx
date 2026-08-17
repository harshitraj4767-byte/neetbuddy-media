import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { InlineMath, BlockMath } from "react-katex";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { Tikz } from "@/components/tikz";
import { Mermaid } from "@/components/mermaid";
import { qbankImageUrl } from "@/lib/qbank-images";


/**
 * Diagram-aware rich text renderer for exam questions.
 *
 * Two modes:
 *  1. HTML mode (trusted admin content contains real HTML tags like <div>,
 *     <br>, <table>, <sub>, <sup>): render via dangerouslySetInnerHTML and
 *     post-process LaTeX ($..$, \(..\), $$..$$, \[..\]) with KaTeX.
 *  2. Markdown mode (plain content): existing renderer with **bold**, *italic*,
 *     inline/block math, images, tikz/mermaid/svg blocks.
 */
export function RichText({ children, className }: { children?: string | null; className?: string }) {
  if (!children) return null;
  // Resolve every image reference (markdown or <img>) to a real URL FIRST, so
  // stored paths like `chemistry/15_103519_question_1.png` work in both modes.
  const src = resolveImageRefs(wrapBareDataImages(normalizeRichText(children)));
  if (containsHtml(src)) {
    // HTML mode used to render `![diagram](...)` as literal text because
    // dangerouslySetInnerHTML does no markdown parsing. Convert first.
    return <HtmlRichText html={markdownImgToHtml(src)} className={className} />;
  }
  // Non-HTML content: still convert raw <img> tags to markdown so paths
  // never leak through as literal text.
  const md = htmlImgToMarkdown(src);
  try {
    return <span className={cn("whitespace-pre-wrap break-words", className)}>{renderBlocks(md)}</span>;
  } catch (error) {
    console.error("[rich-text] render failed", error, { preview: md.slice(0, 180) });
    return <span className={cn("whitespace-pre-wrap break-words", className)}>{md}</span>;
  }
}

// `br` is deliberately NOT in this list: a huge share of imported question /
// option / explanation rows are plain text + LaTeX with a single trailing
// `<br>`. Treating those as "HTML" routed them through the innerHTML path
// where a KaTeX failure left raw `$$...$$` on screen. `<br>` alone is
// downgraded to a newline in normalizeRichText and rendered in markdown mode.
const HTML_TAG_RE = /<\/?(?:div|table|tbody|thead|tr|td|th|p|hr|sub|sup|span|b|i|u|em|strong|ul|ol|li|img|figure|figcaption|small|font|center|pre|code|h[1-6])\b/i;
function containsHtml(s: string) {
  return HTML_TAG_RE.test(s);
}


// Some imported papers (notably NEET PYQ dumps) embed diagrams as a bare
// `data:image/png;base64,…` string with no markdown or <img> wrapper. Turn
// those into markdown images so they render instead of dumping raw base64.
const BARE_DATA_IMG_RE = /(^|[^("'=\]])(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{40,})/gi;
function wrapBareDataImages(s: string): string {
  return s.replace(BARE_DATA_IMG_RE, (_m, pre: string, url: string) => `${pre}\n\n![](${url})\n\n`);
}


// Any `![alt](url)` — the URL may be absolute, app-absolute, or a bare
// question-bank path (`chemistry/15_103519_question_1.png`).
const MD_IMG_RE = /!\[([^\]]*)\]\(\s*([^\s)]+)\s*\)/g;
const HTML_IMG_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;

/** Rewrite image URLs inside markdown and <img> tags through the resolver. */
function resolveImageRefs(src: string): string {
  let out = src.replace(MD_IMG_RE, (whole, alt: string, url: string) => {
    const resolved = qbankImageUrl(url);
    return resolved ? `![${alt}](${resolved})` : whole;
  });
  out = out.replace(HTML_IMG_RE, (whole, d?: string, s?: string, u?: string) => {
    const url = d ?? s ?? u ?? "";
    const resolved = qbankImageUrl(url);
    return resolved && resolved !== url ? whole.replace(url, resolved) : whole;
  });
  return out;
}

/** Markdown images -> real <img> tags, for HTML-mode content. */
function markdownImgToHtml(src: string): string {
  return src.replace(MD_IMG_RE, (_whole, alt: string, url: string) => {
    const safeUrl = escapeAttr(url);
    return `<img src="${safeUrl}" alt="${escapeAttr(alt || "diagram")}" loading="lazy" class="qb-diagram" />`;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


function HtmlRichText({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    renderMathIn(el);
    // A diagram that 404s must never leave a broken-image box or literal path
    // on screen — hide it instead. Keeps future image uploads risk-free.
    el.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => {
        img.style.display = "none";
        console.warn("[rich-text] diagram failed to load", img.getAttribute("src"));
      });
      img.setAttribute("loading", img.getAttribute("loading") ?? "lazy");
      img.setAttribute("decoding", "async");
    });
  }, [html]);
  return (
    <div
      ref={ref}
      className={cn("rich-html break-words", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}


// Walk text nodes and replace $..$, \(..\), $$..$$, \[..\] with KaTeX-rendered spans.
function renderMathIn(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(".katex, script, style, code, pre")) return NodeFilter.FILTER_REJECT;
      return /\$|\\\(|\\\[/.test(node.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([^\n]+?)\\\)/g;
  for (const textNode of targets) {
    const text = textNode.nodeValue ?? "";
    let last = 0;
    let m: RegExpExecArray | null;
    const frag = document.createDocumentFragment();
    let matched = false;
    while ((m = re.exec(text))) {
      matched = true;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const displayMode = m[1] !== undefined || m[2] !== undefined;
      const tex = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "") as string;
      const span = document.createElement("span");
      try {
        katex.render(tex, span, { displayMode, throwOnError: false, output: "html" });
      } catch {
        span.textContent = tex;
      }
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (matched) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.replaceWith(frag);
    }
    re.lastIndex = 0;
  }
}

function normalizeRichText(src: string): string {
  let s = src.replace(/\r\n/g, "\n");

  // AI sometimes emits the literal two-character sequence `\n` (backslash-n)
  // instead of a real newline. Turn those into real line breaks so
  // whitespace-pre-wrap actually breaks the line. Preserve `\\n` (escaped).
  s = s.replace(/(^|[^\\])\\n/g, "$1\n");
  s = s.replace(/^\\n/g, "\n");

  // A lone `<br>` (very common at the end of imported options/explanations)
  // is not real HTML structure — downgrade it to a newline so the content
  // keeps using the resilient markdown renderer.
  if (!HTML_TAG_RE.test(s)) s = s.replace(/<br\s*\/?>/gi, "\n");

  // Older AI rows were stored with JSON-escaped LaTeX as real text, e.g.
  // `\\text{CH}_3` instead of `\text{CH}_3`, which KaTeX renders as raw
  // "text...". Keep table row breaks (`\\`) while fixing commands.
  s = s.replace(/\\{2,}([A-Za-z])/g, "\\$1");
  s = s.replace(/\\{4,}(?=\s*(?:\n|$))/g, "\\\\");
  // NOTE: braces are excluded here on purpose. Inside `\begin{array}` a `\\`
  // row break is regularly followed by `{`, and collapsing it to `\{` broke
  // the whole array so KaTeX printed the raw source in red.
  s = s.replace(/\\{2,}([\[\]()])/g, "\\$1");

  // Decode common HTML entities that leak into plain-text option/question
  // content (e.g. option row `A &ndash; R` from imported question banks).
  s = decodeHtmlEntities(s);

  // Normalise LaTeX so KaTeX can render more legacy question rows:
  //   `\rm{X}`               → `\mathrm{X}`   (KaTeX-friendly)
  //   `\begin{array}{*{20}{c}}...` → `\begin{array}{cccccccccccccccccccc}...`
  //   (KaTeX doesn't support the `*{n}{spec}` column-spec shorthand.)
  s = s.replace(/\\rm\s*\{/g, "\\mathrm{");
  s = s.replace(
    /\{\*\{(\d+)\}\{([^{}]+)\}\}/g,
    (_m, n: string, spec: string) => `{${spec.repeat(Math.min(Number(n) || 1, 40))}}`,
  );
  s = s.replace(
    /\*\{(\d+)\}\{([^{}]+)\}/g,
    (_m, n: string, spec: string) => spec.repeat(Math.min(Number(n) || 1, 40)),
  );

  // Promote any `$…$` inline span that contains a newline or a `\begin{array}`
  // to a `$$…$$` block. Options can hold a full LaTeX array table inside
  // single-`$` delimiters; the inline path rejects newlines and shows raw
  // TeX. Block-mode picks these up via renderBlocks.
  s = promoteMultiLineInline(s);

  // …and the reverse: most imported rows wrap *inline* symbols in `$$…$$`
  // (`across a resistor $$r$$ and a capacitor $$C$$`). Rendering those in
  // display mode threw every symbol onto its own centred line and shredded
  // the sentence. Short, single-line, non-environment math goes back inline.
  s = demoteShortBlocks(s);

  return s;
}

const INLINE_SAFE_BLOCK = /^[^\n]{1,90}$/;
function demoteShortBlocks(s: string): string {
  return s.replace(/\$\$([\s\S]+?)\$\$/g, (whole, inner: string) => {
    const tex = inner.trim();
    if (!INLINE_SAFE_BLOCK.test(tex)) return whole;
    if (/\\begin\{|\\\\|\\hline|\\displaystyle/.test(tex)) return whole;
    return `$${tex}$`;
  });
}



function promoteMultiLineInline(s: string): string {
  // Skip already-doubled `$$` regions to avoid double-wrapping.
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "$" && s[i + 1] === "$") {
      const end = s.indexOf("$$", i + 2);
      if (end === -1) { parts.push(s.slice(i)); break; }
      parts.push(s.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    if (s[i] === "$" && s[i - 1] !== "\\") {
      const end = findClosingDollar(s, i + 1);
      if (end === -1) { parts.push(s[i]); i++; continue; }
      const inner = s.slice(i + 1, end);
      const needsBlock = /\n|\\begin\{(?:array|matrix|pmatrix|bmatrix|cases|align|aligned|gather)\}/.test(inner);
      parts.push(needsBlock ? `$$${inner}$$` : `$${inner}$`);
      i = end + 1;
      continue;
    }
    parts.push(s[i]);
    i++;
  }
  return parts.join("");
}

function findClosingDollar(s: string, start: number): number {
  for (let i = start; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s[i] === "$") return i;
  }
  return -1;
}

// Decode a small, safe set of HTML entities found in imported question text.
function decodeHtmlEntities(s: string): string {
  if (!s || (s.indexOf("&") === -1)) return s;
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", zwj: "", zwnj: "",
    ndash: "–", mdash: "—", hellip: "…",
    laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", sbquo: "‚", bdquo: "„",
    ldquo: "“", rdquo: "”", times: "×", divide: "÷",
    deg: "°", plusmn: "±", micro: "µ", middot: "·",
    rarr: "→", larr: "←", uarr: "↑", darr: "↓",
    harr: "↔", infin: "∞", asymp: "≈", ne: "≠",
    le: "≤", ge: "≥",
    trade: "™", copy: "©", reg: "®", para: "¶", sect: "§",
    bull: "•", prime: "′", Prime: "″", frasl: "⁄",
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
    theta: "θ", lambda: "λ", mu: "μ", pi: "π", sigma: "σ", omega: "ω",
    Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
    Lambda: "Λ", Sigma: "Σ", Omega: "Ω",
  };
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => {
      const n = Number(d);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _m;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _m;
    })
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => named[name] ?? m);
}

// Convert HTML <img src="..."> tags in non-HTML content to markdown image
// syntax so the markdown-mode renderer picks them up. HTML-mode content is
// rendered separately via dangerouslySetInnerHTML.
function htmlImgToMarkdown(src: string): string {
  return src.replace(
    /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi,
    (_, d, s, u) => `![diagram](${d ?? s ?? u ?? ""})`,
  );
}

function renderBlocks(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /```tikz\s*([\s\S]+?)```|```mermaid\s*([\s\S]+?)```|(<svg[\s\S]+?<\/svg>)|(\\begin\{tikzpicture\}[\s\S]+?\\end\{tikzpicture\})|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(<Fragment key={k++}>{renderInline(src.slice(last, m.index))}</Fragment>);
    if (m[1] !== undefined) {
      const imgUrl = m[2];
      out.push(<TikzBlock key={k++} code={m[1].trim()} />);
    } else if (m[2] !== undefined) {
      out.push(<MermaidBlock key={k++} code={m[2].trim()} />);
    } else if (m[3] !== undefined) {
      out.push(<SvgBlock key={k++} svg={m[3]} />);
    } else if (m[4] !== undefined) {
      out.push(<TikzBlock key={k++} code={m[4].trim()} />);
    } else {
      const tex = (m[5] ?? m[6] ?? "") as string;
      out.push(
        <span key={k++} className="my-2 block overflow-x-auto">
          <BlockMath math={tex} renderError={() => <span className="font-sans text-base not-italic">{plainLatex(tex)}</span>} />
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(<Fragment key={k++}>{renderInline(src.slice(last))}</Fragment>);
  return out;
}

function DiagramFrame({ children }: { children: ReactNode }) {
  return (
    <span className="my-3 flex justify-center overflow-x-auto rounded-xl border border-border/60 bg-card/60 p-3 shadow-sm">
      {children}
    </span>
  );
}

function TikzBlock({ code }: { code: string }) {
  const body = /\\begin\{tikzpicture\}/.test(code)
    ? code
    : `\\begin{tikzpicture}\n${code}\n\\end{tikzpicture}`;
  return <DiagramFrame><Tikz>{body}</Tikz></DiagramFrame>;
}

function MermaidBlock({ code }: { code: string }) {
  return <DiagramFrame><Mermaid>{code}</Mermaid></DiagramFrame>;
}

function SvgBlock({ svg }: { svg: string }) {
  // Render inline SVG — trusted question content from admin import.
  const cleanedSvg = svg.replace(/\$([^$]+?)\$/g, (_, tex: string) => tex.replace(/\\text\{([^}]+)\}/g, "$1"));
  return <DiagramFrame><span className="max-w-full [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: cleanedSvg }} /></DiagramFrame>;
}

function renderInline(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  // image must be first to avoid * being parsed
  // Image URL accepts: https://, http://, /, data:image/... (base64), and blob:
  // URLs are already resolved by resolveImageRefs, so accept any non-space URL.
  const re = /!\[([^\]]*)\]\(\s*([^\s)]+)\s*\)|\$([^$\n]+?)\$|\\\(([^\n]+?)\\\)|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(<Fragment key={k++}>{src.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      const imgUrl = m[2];
      out.push(

        <img
          key={k++}
          src={imgUrl}
          alt={m[1] || "diagram"}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
            console.warn("[rich-text] diagram failed to load", imgUrl);
          }}
          className="my-2 inline-block max-h-80 max-w-full object-contain"
          style={{ border: "none", outline: "none", background: "transparent", boxShadow: "none" }}
        />,
      );

    } else if (m[3] !== undefined || m[4] !== undefined) {
      const tex = (m[3] ?? m[4]) as string;
      out.push(<InlineMath key={k++} math={tex} renderError={() => <span>{plainLatex(tex)}</span>} />);
    } else if (m[5] !== undefined) {
      out.push(<strong key={k++}>{m[5]}</strong>);
    } else if (m[6] !== undefined) {
      out.push(<em key={k++}>{m[6]}</em>);
    } else if (m[7] !== undefined) {
      out.push(<code key={k++} className="rounded bg-secondary px-1 py-0.5 text-[0.9em]">{m[7]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(<Fragment key={k++}>{src.slice(last)}</Fragment>);
  return out;
}

function plainLatex(tex: string): string {
  return tex
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\\(?:begin|end)\{[^}]+\}/g, "")
    .replace(/\\(?:hline|left|right)/g, "")
    .replace(/\\xrightarrow\{([^}]*)\}/g, " → $1 → ")
    .replace(/\\/g, " ")
    .replace(/[{}$]/g, "")
    .replace(/_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
