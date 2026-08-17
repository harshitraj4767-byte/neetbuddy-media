import type { Topic } from "../data/topics";

interface Props {
  subject: "biology" | "physics" | "chemistry";
  title: string;
  desc: string;
  topics: Topic[];
  onPick: (slug: string) => void;
}

export function SubjectIndex({ subject, title, desc, topics, onPick }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-1 py-6">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-primary">{subject}</div>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{desc}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((t) => (
          <button
            key={t.slug}
            onClick={() => onPick(t.slug)}
            className="group block h-full rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{t.tag}</div>
            <h3 className="mt-3 text-lg font-bold">{t.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{t.blurb}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Open <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
