import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Loader2, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createCustomTestWithBonus } from "@/lib/generate-test.functions";
import { TopicPicker, TopicPickerLoading, useTopicTree } from "@/components/topic-picker";
import { countSelectedTopics, toTopicFilter } from "@/lib/topic-tree";

export const Route = createFileRoute("/generate")({
  head: () => ({ meta: [{ title: "Generate Test — Neet Buddy" }] }),
  component: GeneratePage,
});

type Subject = { id: string; name: string };
type Chapter = { id: string; name: string; subject_id: string };

function GeneratePage() {
  const { user, profile, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [chapIds, setChapIds] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"mix" | "easy" | "medium" | "hard">("mix");
  const [timer, setTimer] = useState(15);
  const [launching, setLaunching] = useState(false);
  // Sub-topic selection is opt-OUT: every topic starts ticked, and this set
  // records only what the student unticked via the chevron expander.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  const createTest = useServerFn(createCustomTestWithBonus);
  const bonus = Number(profile?.bonus_balance ?? 0);
  const BONUS_COST = 0;

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    fetch("/api/quiz.php?action=getSubjectTree")
      .then((r) => r.json())
      .then((data) => {
        if (data.subjects) setSubjects(data.subjects);
        if (data.chapters) setAllChapters(data.chapters);
      })
      .catch((e) => console.warn("Failed to load subject tree:", e));
  }, []);

  useEffect(() => {
    if (!subjectIds.length) { setChapters([]); setChapIds([]); return; }
    const filtered = allChapters.filter((c) => subjectIds.includes(String(c.subject_id)));
    setChapters(filtered);
    setChapIds((prev) => {
      const kept = prev.filter((id) => filtered.some((c) => String(c.id) === String(id)));
      const known = new Set(prev.map(String));
      const added = filtered.filter((c) => !known.has(String(c.id))).map((c) => String(c.id));
      return [...kept, ...added];
    });
  }, [subjectIds.join(","), allChapters]);

  const toggleSubject = (id: string) =>
    setSubjectIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleChap = (id: string) =>
    setChapIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleExcluded = (keys: string[], exclude: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) (exclude ? next.add(k) : next.delete(k));
      return next;
    });

  const subjectName = useMemo(() => {
    if (!subjectIds.length) return "Custom";
    const names = subjects.filter((s) => subjectIds.includes(s.id)).map((s) => s.name);
    return names.length <= 2 ? names.join(" + ") : "Multi-subject";
  }, [subjectIds, subjects]);

  const chaptersBySubject = useMemo(() => {
    const map: Record<string, Chapter[]> = {};
    for (const c of chapters) (map[c.subject_id] ||= []).push(c);
    return map;
  }, [chapters]);

  // Load the topic tree only for the chapter the student expanded.
  const { tree, loading: treeLoading } = useTopicTree(openChapter ? [openChapter] : []);
  const topicStats = countSelectedTopics(tree, excluded);

  const start = async (mode: "quiz" | "exam" | "cbt") => {
    if (!user || !chapIds.length) return;
    if (chapIds.length > 30) {
      toast.error("Please pick at most 30 chapters.");
      return;
    }
    // Bonus/wallet feature removed — tests are free now.
    setLaunching(true);
    try {
      const res = await fetch("/api/quiz.php?action=generateCustomTest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject_ids: subjectIds,
          chapter_ids: chapIds,
          total_questions: count,
          difficulty,
          duration_min: timer,
          title: `${subjectName} Custom Test`,
        }),
      });
      const data = await res.json();
      if (data.test_id) {
        toast.success("Test ready");
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode } as never });
      } else {
        toast.error(data.error || "Could not generate test");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <PageShell eyebrow="Builder" title="Generate Test" description="Build a custom test step-by-step.">
      <Stepper step={step} />
      {step === 1 && (
        <div className="mt-6 space-y-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Pick one or more subjects</span>
            <span>{subjectIds.length} selected</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {subjects.map((s) => {
              const active = subjectIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSubject(s.id)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl border p-5 text-left transition hover:border-primary/40",
                    active ? "border-primary bg-primary/5" : "border-border bg-card",
                  )}
                >
                  <span className="text-base font-semibold">{s.name}</span>
                  <span className={cn(
                    "flex h-5 w-5 items-center justify-center rounded border-2 transition",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              className="flex-1 bg-gradient-primary"
              onClick={() => setStep(2)}
              disabled={!subjectIds.length}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="mt-6 space-y-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {chapIds.length} / {chapters.length} chapters selected
              {excluded.size > 0 && ` · ${topicStats.selected}/${topicStats.total} sub-topics`}
            </span>
            {chapters.length > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() =>
                  setChapIds((prev) => (prev.length === chapters.length ? [] : chapters.map((c) => c.id)))
                }
              >
                {chapIds.length === chapters.length ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          {subjectIds.map((sid) => {
            const subj = subjects.find((s) => s.id === sid);
            const list = chaptersBySubject[sid] ?? [];
            if (!subj) return null;
            return (
              <div key={sid} className="space-y-1.5">
                <div className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {subj.name}
                </div>
                {list.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">No chapters yet.</div>
                ) : (
                  list.map((c) => {
                    const active = chapIds.includes(c.id);
                    const isOpen = openChapter === c.id;
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "rounded-xl border transition",
                          active ? "border-primary bg-primary/5" : "border-border bg-card",
                        )}
                      >
                        <div className="flex w-full items-center gap-2 p-4">
                          <button onClick={() => toggleChap(c.id)} className="min-w-0 flex-1 text-left">
                            <span className="text-sm font-medium">{c.name}</span>
                          </button>
                          <button
                            type="button"
                            aria-label={isOpen ? "Hide sub-topics" : "Choose sub-topics"}
                            aria-expanded={isOpen}
                            disabled={!active}
                            onClick={() => setOpenChapter(isOpen ? null : c.id)}
                            className="rounded p-1 text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                          </button>
                          <button
                            onClick={() => toggleChap(c.id)}
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border-2 transition",
                              active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                            )}
                            aria-label={active ? "Deselect chapter" : "Select chapter"}
                          >
                            {active && <Check className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {isOpen && (
                          <div className="border-t border-border/60 px-4 py-3">
                            {treeLoading ? (
                              <TopicPickerLoading />
                            ) : (
                              <TopicPicker
                                topics={tree.find((t) => t.chapterId === c.id)?.topics ?? []}
                                excluded={excluded}
                                onToggle={toggleExcluded}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Previous</Button>
            <Button className="flex-1 bg-gradient-primary" onClick={() => setStep(3)} disabled={!chapIds.length}>Next</Button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="mt-6 space-y-6">
          <div>
            <div className="mb-2 text-sm font-bold">Difficulty</div>
            <div className="grid grid-cols-4 gap-2">
              {(["mix", "easy", "medium", "hard"] as const).map((d) => (
                <button key={d} onClick={() => setDifficulty(d)} className={cn("rounded-xl border p-3 text-sm font-semibold capitalize", difficulty === d ? "border-primary bg-primary/5" : "border-border")}>{d === "mix" ? "Mix Qs." : d}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-bold">Number of Questions</div>
            <div className="grid grid-cols-5 gap-2">
              {[10, 20, 30, 50, 90].map((n) => (
                <button key={n} onClick={() => setCount(n)} className={cn("rounded-xl border p-3 text-sm font-semibold", count === n ? "border-primary bg-primary/5" : "border-border")}>{n} Qs.</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-bold">Timer (minutes)</div>
            <div className="grid grid-cols-4 gap-2">
              {[10, 15, 30, 60].map((n) => (
                <button key={n} onClick={() => setTimer(n)} className={cn("rounded-xl border p-3 text-sm font-semibold", timer === n ? "border-primary bg-primary/5" : "border-border")}>{n} min</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-bold">Mode</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="outline" size="lg" disabled={launching} onClick={() => start("quiz")} className="h-auto flex-col items-start gap-1 p-4">
                <span className="font-bold">Quiz Mode</span>
                <span className="text-xs font-normal text-muted-foreground">Review answer within the session</span>
              </Button>
              <Button size="lg" disabled={launching} onClick={() => start("exam")} className="h-auto flex-col items-start gap-1 bg-gradient-primary p-4">
                <span className="font-bold">Exam Mode</span>
                <span className="text-xs font-normal opacity-90">Review after submission</span>
              </Button>
              <Button size="lg" disabled={launching} onClick={() => start("cbt")} className="h-auto flex-col items-start gap-1 bg-emerald-600 p-4 text-white hover:bg-emerald-700">
                <span className="font-bold">CBT Mode (NTA)</span>
                <span className="text-xs font-normal opacity-90">Full NTA-style simulation with palette</span>
              </Button>
            </div>
            {launching && <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Building your test...</div>}
          </div>
          <Button variant="outline" onClick={() => setStep(2)}>Previous</Button>
        </div>
      )}
    </PageShell>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Subjects", "Chapters", "Preference"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 items-center gap-2">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", step > i + 1 ? "bg-emerald-500 text-white" : step === i + 1 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
            {step > i + 1 ? "✓" : i + 1}
          </span>
          <span className={cn("text-sm font-semibold", step === i + 1 ? "text-foreground" : "text-muted-foreground")}>{l}</span>
          {i < 2 && <span className="h-px flex-1 bg-border" />}
        </div>
      ))}
    </div>
  );
}
