import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadWatermarkedPdf } from "@/lib/pdf-watermark";
import { logShortNoteDownload } from "@/lib/trial-limits.functions";
import { toast } from "sonner";

// Search params must never throw: a bare /study-view visit (or the prerender
// pass, which has no query string) would otherwise fail the whole route.
const searchSchema = z.object({
  url: z.string().url().optional().catch(undefined),
  title: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/study-view")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => ({
    meta: [
      { title: `${(match.search as { title?: string }).title ?? "Study Material"} — Neet Buddy` },
      { name: "description", content: "Study material viewer with Neet Buddy watermark." },
    ],
  }),
  component: StudyViewPage,
});

function StudyViewPage() {
  const { url, title } = useSearch({ from: "/study-view" });
  const logDl = useServerFn(logShortNoteDownload);
  const [busy, setBusy] = useState(false);
  const displayTitle = title ?? "Study Material";

  async function handleDownload() {
    if (busy || !url) return;
    setBusy(true);
    try {
      // Trial-quota check + record BEFORE downloading so bandwidth isn't wasted.
      await logDl({ data: { title: displayTitle } });
      await downloadWatermarkedPdf(url, `${displayTitle}.pdf`);
      toast.success("Downloaded with watermark");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  if (!url) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-lg font-semibold">No document selected</h1>
        <p className="text-sm text-muted-foreground">
          Open a study material from the library to read it here.
        </p>
        <Button asChild size="sm">
          <Link to="/study-essentials">
            <ArrowLeft className="mr-1 h-4 w-4" /> Browse study materials
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <Button asChild size="sm" variant="ghost" className="h-8">
          <Link to="/study-essentials"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{displayTitle}</div>
        <Button size="sm" onClick={handleDownload} disabled={busy} className="h-8 bg-gradient-primary">
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />} PDF
        </Button>
      </div>
      <div className="relative flex-1">
        <iframe
          src={url}
          title={displayTitle}
          className="absolute inset-0 h-full w-full border-0"
        />
        {/* Watermark overlay — rounded logo, centered, non-blocking */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <img
            src="/icons/icon-192.png"
            alt=""
            className="h-[min(320px,40vw)] w-[min(320px,40vw)] rounded-[22%] object-cover opacity-[0.17]"
          />
        </div>
      </div>
    </div>
  );
}
