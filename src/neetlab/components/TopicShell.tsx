import type { ReactNode } from "react";

interface Props {
  subject: "biology" | "physics" | "chemistry";
  title: string;
  tag: string;
  blurb: string;
  children: ReactNode;
  notes?: ReactNode;
  onBack?: () => void;
}

export function TopicShell({ subject, title, tag, blurb, children, notes, onBack }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-1 py-4">
      {onBack && (
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          ← Back to {subject}
        </button>
      )}
      <div className="mt-3 mb-5">
        <div className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{tag}</div>
        <h2 className="mt-2 text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">{children}</div>
        {notes && (
          <aside className="rounded-2xl border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">Key points</h3>
            <div className="prose prose-sm dark:prose-invert">{notes}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
