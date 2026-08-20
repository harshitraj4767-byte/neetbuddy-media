import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RichText } from "@/components/rich-text";

export const Route = createFileRoute("/rtdev")({
  head: () => ({ meta: [{ title: "RT dev" }] }),
  component: RtDev,
});

type Q = { id: string; text: string; options: string[] };

function RtDev() {
  const [qs, setQs] = useState<Q[]>([]);
  useEffect(() => { fetch("/rtdev-samples.json").then(r => r.json()).then(setQs); }, []);
  return (
    <div className="mx-auto max-w-2xl p-4">
      {qs.map((q) => (
        <div key={q.id} className="mb-6 rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">#{q.id}</div>
          <RichText>{q.text}</RichText>
          <div className="mt-3 grid gap-2">
            {q.options.map((o, i) => (
              <div key={i} className="rounded-lg border p-2"><RichText>{o}</RichText></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
