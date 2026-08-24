import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  importSubjectPyqs,
  linkSubjectPyqs,
  pyqCoverage,
  type SyncSubject,
} from "@/lib/ncert-pyq-sync";

export const Route = createFileRoute("/admin-pyq-sync")({
  ssr: false,
  component: AdminPyqSync,
  head: () => ({
    meta: [
      { title: "PYQ Sync · Admin" },
      { name: "description", content: "Import and link NCERT previous-year questions per subject." },
      { property: "og:title", content: "PYQ Sync · Admin" },
      { property: "og:description", content: "Import and link NCERT previous-year questions per subject." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const SUBJECTS: SyncSubject[] = ["physics", "chemistry", "biology"];

function AdminPyqSync() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<{ subject: string; rows: number }[]>([]);

  const push = useCallback((line: string) => setLog((l) => [...l.slice(-200), line]), []);

  const refresh = useCallback(async () => {
    try {
      setCoverage(await pyqCoverage());
    } catch (e) {
      push(`Coverage read failed: ${(e as Error).message}`);
    }
  }, [push]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (subject: SyncSubject, mode: "import" | "link") => {
      setBusy(true);
      push(`▶ ${mode} ${subject} …`);
      try {
        if (mode === "import") {
          const res = await importSubjectPyqs(subject, (done, total) => {
            if (done % 2000 === 0 || done === total) push(`  ${subject}: ${done}/${total} rows`);
          });
          push(`✔ imported ${res.imported} ${subject} questions`);
        } else {
          const res = await linkSubjectPyqs(subject, (done, total, label) => {
            if (done % 5 === 0 || done === total) push(`  ${done}/${total} — ${label}`);
          });
          push(`✔ linked ${res.linked} questions across ${res.chapters} chapters`);
          if (res.unmatchedChapters.length) {
            push(`⚠ dataset chapters with no book match: ${res.unmatchedChapters.join(", ")}`);
          }
        }
        await refresh();
      } catch (e) {
        push(`✖ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [push, refresh],
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">NCERT PYQ sync</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Loads <code>/ncert/pyq/&lt;subject&gt;.json</code> into <code>ncert_book_pyq</code> and attaches every
        question to a chapter block. Admin-only — writes are rejected by the database for everyone else.
      </p>

      <div className="mt-6 grid gap-3">
        {SUBJECTS.map((subject) => (
          <div
            key={subject}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          >
            <div>
              <div className="font-medium capitalize">{subject}</div>
              <div className="text-sm text-muted-foreground">
                {coverage.find((c) => c.subject === subject)?.rows ?? "…"} questions in database
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(subject, "import")}
                className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                Import
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(subject, "link")}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Link to chapters
              </button>
            </div>
          </div>
        ))}
      </div>

      <pre className="mt-6 max-h-96 overflow-auto rounded-xl border bg-muted/40 p-4 text-xs leading-5">
        {log.join("\n") || "Idle."}
      </pre>
    </main>
  );
}
