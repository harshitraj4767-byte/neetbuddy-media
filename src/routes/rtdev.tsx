import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SafeRichText } from "@/components/safe-rich-text";

export const Route = createFileRoute("/rtdev")({
  head: () => ({ meta: [{ title: "Renderer dev harness" }] }),
  component: RtDev,
});

type Row = { text: string; options: string[] };

function RtDev() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/rtdev-samples.json")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-border p-3">
          <SafeRichText className="text-sm">{r.text}</SafeRichText>
          <div className="mt-2 space-y-2">
            {(r.options ?? []).map((o, j) => (
              <div key={j} className="rounded-lg border border-border p-2 text-sm">
                <SafeRichText>{o}</SafeRichText>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
