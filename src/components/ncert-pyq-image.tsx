import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { pyqImageCandidates } from "@/lib/ncert-book";
import { cn } from "@/lib/utils";

/**
 * Diagram renderer for NCERT-linked PYQs.
 *
 * Stored image references are inconsistent across imports, so we walk a list
 * of candidate URLs and fall through to the next one on error instead of
 * leaving a broken image (or a stray filename) on screen.
 */
export function NcertPyqImage({
  src,
  subject,
  alt = "Question diagram",
  className,
}: {
  src?: string | null;
  subject?: string | null;
  alt?: string;
  className?: string;
}) {
  const candidates = pyqImageCandidates(src, subject);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setI(0);
    setFailed(false);
  }, [src, subject]);

  if (candidates.length === 0) return null;

  if (failed) {
    return (
      <figure className="my-3 flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 p-5 text-xs text-muted-foreground">
        <ImageIcon className="h-4 w-4 opacity-60" />
        Diagram unavailable
      </figure>
    );
  }

  return (
    <figure className={cn("my-3 flex justify-center", className)}>
      <img
        src={candidates[i]}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (i + 1 < candidates.length) setI(i + 1);
          else setFailed(true);
        }}
        className="max-h-[46vh] w-auto max-w-full rounded-xl border bg-card object-contain p-1"
      />
    </figure>
  );
}
