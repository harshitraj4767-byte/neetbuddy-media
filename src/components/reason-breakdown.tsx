import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, SkipForward, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const WRONG_REASONS: { value: string; label: string }[] = [
  { value: "guess", label: "Guessed" },
  { value: "conceptual", label: "Conceptual" },
  { value: "calculation", label: "Calculation" },
  { value: "silly_mistake", label: "Silly mistake" },
  { value: "misread", label: "Misread" },
  { value: "time_pressure", label: "Out of time" },
  { value: "other", label: "Other" },
];
const CORRECT_REASONS: { value: string; label: string }[] = [
  { value: "confident", label: "Confident" },
  { value: "concept_clear", label: "Concept clear" },
  { value: "elimination", label: "Elimination" },
  { value: "lucky_guess", label: "Lucky guess" },
  { value: "revised_recently", label: "Revised recently" },
  { value: "other", label: "Other" },
];
const SKIPPED_REASONS: { value: string; label: string }[] = [
  { value: "no_time", label: "Ran out of time" },
  { value: "didnt_know", label: "Didn't know" },
  { value: "too_hard", label: "Too hard" },
  { value: "confusing", label: "Confusing" },
  { value: "skipped_deliberate", label: "Deliberate" },
  { value: "other", label: "Other" },
];

type Q = { id: string; correct_index: number };

export function ReasonBreakdown({
  questions,
  answers,
  reasons,
  hint,
}: {
  questions: Q[];
  answers: Record<string, number>;
  reasons: Record<string, string>;
  hint?: string;
}) {
  const groups = { correct: [] as string[], wrong: [] as string[], skipped: [] as string[] };
  questions.forEach((q) => {
    const u = answers[q.id];
    const kind: "correct" | "wrong" | "skipped" =
      u === undefined ? "skipped" : u === q.correct_index ? "correct" : "wrong";
    groups[kind].push(q.id);
  });

  const rows: {
    key: "correct" | "wrong" | "skipped";
    label: string;
    Icon: typeof CheckCircle2;
    tone: string;
    chip: string;
    dot: string;
    opts: { value: string; label: string }[];
  }[] = [
    { key: "correct", label: "Correct", Icon: CheckCircle2, tone: "text-emerald-600", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", opts: CORRECT_REASONS },
    { key: "wrong",   label: "Wrong",   Icon: XCircle,      tone: "text-rose-600",    chip: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",       dot: "bg-rose-500",    opts: WRONG_REASONS },
    { key: "skipped", label: "Skipped", Icon: SkipForward,  tone: "text-muted-foreground", chip: "border-border bg-muted text-foreground", dot: "bg-muted-foreground", opts: SKIPPED_REASONS },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Tag className="h-4 w-4 text-primary" /> Attempt breakdown · why?
        </div>
        <div className="space-y-3">
          {rows.map(({ key, label, Icon, tone, chip, dot, opts }) => {
            const ids = groups[key];
            const total = ids.length;
            const counts: Record<string, number> = {};
            let tagged = 0;
            ids.forEach((id) => {
              const r = reasons[id];
              if (r) {
                counts[r] = (counts[r] ?? 0) + 1;
                tagged++;
              }
            });
            const items = opts
              .map((o) => ({ ...o, n: counts[o.value] ?? 0 }))
              .filter((o) => o.n > 0)
              .sort((a, b) => b.n - a.n);
            return (
              <div key={key} className="rounded-xl border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className={cn("flex items-center gap-2 text-sm font-semibold", tone)}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">{total}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {tagged}/{total} tagged
                  </span>
                </div>
                {items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((o) => (
                      <span key={o.value} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", chip)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                        {o.label} ({o.n})
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    {total === 0 ? "None." : "Not tagged yet — open a question below to tag."}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
