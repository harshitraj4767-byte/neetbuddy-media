import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookOpen, Download, FileText, Loader, Lock } from "lucide-react";
import { toast } from "sonner";
import { downloadWatermarkedPdf } from "@/lib/pdf-watermark";
import { logShortNoteDownload } from "@/lib/trial-limits.functions";
import { useAccess } from "@/hooks/use-access";
import { SHORT_NOTES, type ShortNote } from "@/data/short-notes";

const SUBJECTS: { id: ShortNote["subject"]; name: string }[] = [
  { id: "physics", name: "Physics" },
  { id: "chemistry", name: "Chemistry" },
  { id: "biology", name: "Biology" },
];

function notesFor(subject: ShortNote["subject"]) {
  return SHORT_NOTES.filter((n) => n.subject === subject).sort(
    (a, b) => a.cls - b.cls || a.chapter - b.chapter,
  );
}

/** The first note of every subject is free; everything else is Prime-only. */
function freeFileFor(subject: ShortNote["subject"]) {
  return notesFor(subject)[0]?.file ?? null;
}

export function ShortNotesBrowser({ onBack }: { onBack: () => void }) {
  const [subject, setSubject] = useState<ShortNote["subject"] | null>(null);
  const { access, tier } = useAccess();
  const isPrime = access.isAdmin || tier === "prime" || tier === "elite";

  if (!subject) {
    return (
      <>
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubject(s.id)}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-bold">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{notesFor(s.id).length} chapter-wise PDFs</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  }

  const list = notesFor(subject);
  const freeFile = freeFileFor(subject);
  const byClass = [11, 12].map((cls) => ({ cls, items: list.filter((n) => n.cls === cls) }));

  return (
    <>
      <button onClick={() => setSubject(null)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to subjects
      </button>
      {!isPrime && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>
            Chapter 1 is free for everyone. Unlock all {list.length} short notes with <b>Prime</b>.
          </span>
          <Button asChild size="sm" className="h-8 bg-gradient-primary">
            <Link to="/premium">Upgrade to Prime</Link>
          </Button>
        </div>
      )}
      <div className="space-y-5">
        {byClass.filter((g) => g.items.length > 0).map((g) => (
          <div key={g.cls}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Class {g.cls}</h3>
            <Card>
              <CardContent className="space-y-2 p-3">
                {g.items.map((n) => (
                  <NoteRow
                    key={n.file}
                    note={n}
                    locked={!isPrime && n.file !== freeFile}
                  />
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}

function NoteRow({ note, locked }: { note: ShortNote; locked: boolean }) {
  const [busy, setBusy] = useState(false);
  const logDl = useServerFn(logShortNoteDownload);
  const title = `Chapter ${note.chapter} — ${note.name}`;

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Preparing your PDF…");
    try {
      await logDl({ data: { title } });
      await downloadWatermarkedPdf(note.file, `${title}.pdf`);
      toast.success("Download started", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not prepare PDF", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <FileText className={`h-4 w-4 shrink-0 ${locked ? "text-muted-foreground" : "text-primary"}`} />
        <span className="truncate font-medium">{title}</span>
      </div>
      {locked ? (
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/premium"><Lock className="mr-1 h-3.5 w-3.5" /> Prime only</Link>
        </Button>
      ) : (
        <Button size="sm" className="h-8 bg-gradient-primary" onClick={onDownload} disabled={busy}>
          {busy ? <Loader className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
          Download PDF
        </Button>
      )}
    </div>
  );
}
