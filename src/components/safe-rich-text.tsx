import { Component, type ReactNode } from "react";
import { RichText } from "@/components/rich-text";
import { cn } from "@/lib/utils";

// Bulletproof wrapper around <RichText>. Catches any render error thrown by
// KaTeX / DOM parsing / regex normalisation and falls back to a plain-text
// stripped version so a single malformed question never blanks the CBT screen.
class RichTextBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error("[safe-rich-text] render failed, showing fallback", err);
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function toPlainText(src: string): string {
  if (!src) return "";
  return src
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|li|tr)>/gi, "\n")
    // Preserve image info before stripping tags
    .replace(/<img\b[^>]+src=["']([^"']+)["'][^>]*>/gi, " [Image: $1] ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function SafeRichText({
  children,
  className,
}: {
  children?: string | null;
  className?: string;
}) {
  if (children == null) return null;
  const raw = typeof children === "string" ? children : String(children);
  const fallback = (
    <span className={cn("whitespace-normal break-words", className)}>
      {toPlainText(raw)}
    </span>
  );
  return (
    <RichTextBoundary fallback={fallback}>
      <RichText className={className}>{raw}</RichText>
    </RichTextBoundary>
  );
}
