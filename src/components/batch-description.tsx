import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * Renders a batch description that may contain inline images written as
 * markdown: ![alt](https://...). Plain text keeps its line breaks; images
 * render full-width with rounded corners.
 */
export const BatchDescription = memo(function BatchDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;

  const pushText = (t: string) => {
    if (!t.trim()) return;
    // Split into paragraphs on blank lines, preserve single breaks.
    t.split(/
{2,}/).forEach((para, i, arr) => {
      if (!para.trim()) return;
      nodes.push(
        <p key={} className={cn("whitespace-pre-line", i < arr.length - 1 && "mb-3")}>
          {para.trim()}
        </p>,
      );
    });
  };

  while ((m = IMAGE_RE.exec(text))) {
    pushText(text.slice(last, m.index));
    nodes.push(
      <img
        key={}
        src={m[2]}
        alt={m[1] || "Batch image"}
        loading="lazy"
        className="my-2 w-full rounded-xl border border-border object-cover"
      />,
    );
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));

  if (nodes.length === 0) return null;
  return <div className={cn("space-y-1 text-sm text-foreground/90", className)}>{nodes}</div>;
});
