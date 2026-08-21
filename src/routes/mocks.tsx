import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Clock, FileText, BookOpen, Share2, ListChecks, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { startMockAttempt } from "@/lib/mock-gate.functions";
import { listMockCategories } from "@/lib/mock-categories.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { useAttemptStates, type AttemptState } from "@/hooks/use-attempt-state";
import { AttemptActions, AttemptBadge } from "@/components/attempt-actions";
import { LoadingScreen } from "@/components/loading-screen";

type SyllabusEntry = { subjectId: string; subjectName: string; chapters: { id: string; name: string }[] };

type Test = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  duration_min: number;
  total_questions: number;
  source: string;
  entry_fee: number;
  is_paid: boolean;
  syllabus: SyllabusEntry[] | null;
  category_id: string | null;
};

type Category = { id: string; name: string; sort_order: number; active: boolean };

export const Route = createFileRoute("/mocks")({
  validateSearch: (s: Record<string, unknown>) => ({ mock: typeof s.mock === "string" ? s.mock : undefined }),
  head: () => ({
    meta: [
      { title: "NEET Mock Tests — CBT Mode | Neet Buddy" },
      { name: "description", content: "100+ full-length NTA-pattern NEET 2026 mock tests in CBT mode with syllabus, marking scheme and detailed analysis." },
      { property: "og:title", content: "NEET Mock Tests — CBT Mode | Neet Buddy" },
      { property: "og:description", content: "Class 11, Class 12 and full-syllabus NEET mocks with rules, syllabus and instant analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MocksPage,
});

function MocksPage() {
  const { mock: sharedMockId } = Route.useSearch();
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [tests, setTests] = useState<Test[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const loadCats = useServerFn(listMockCategories);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    (supabase.from("tests") as any)
      .select("id,title,description,difficulty,duration_min,total_questions,source,entry_fee,is_paid,syllabus,category_id,created_at")
      .eq("type", "mock")
      .then(({ data }: any) => {
        const rows = ((data ?? []) as Test[]).slice();
        // Sort by numeric portion of title (Mock 1, Mock 2, … Mock 10) ascending;
        // fall back to alphabetical, then created_at.
        const numOf = (s: string) => {
          const m = s.match(/(\d+)/);
          return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
        };
        rows.sort((a, b) => {
          const na = numOf(a.title), nb = numOf(b.title);
          if (na !== nb) return na - nb;
          return a.title.localeCompare(b.title);
        });
        setTests(rows);
      });
    loadCats().then((c) => setCategories((c as Category[]).filter((x) => x.active))).catch(() => {});
  }, [loadCats]);

  const filtered = useMemo(() => {
    if (!tests) return null;
    if (activeCat === "all") return tests;
    if (activeCat === "uncat") return tests.filter((t) => !t.category_id);
    return tests.filter((t) => t.category_id === activeCat);
  }, [tests, activeCat]);

  const { attempts } = useAttemptStates(useMemo(() => (tests ?? []).map((t) => t.id), [tests]));




  return (
    <PageShell eyebrow="Practice" title="Mock tests" description="Full-length NEET-pattern tests. Filter by category and start any published mock.">
      {tests === null ? <LoadingScreen variant="quiz" fullScreen={false} />
        : tests.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No mocks published yet.</CardContent></Card>
        ) : (
          <div className="space-y-6">
            {/* Category filter slider */}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="flex min-w-max gap-2 pb-1">
                <CatChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label={`All (${tests.length})`} />
                {categories.map((c) => {
                  const n = tests.filter((t) => t.category_id === c.id).length;
                  return <CatChip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={`${c.name} (${n})`} />;
                })}
                {tests.some((t) => !t.category_id) && (
                  <CatChip active={activeCat === "uncat"} onClick={() => setActiveCat("uncat")} label={`Uncategorized (${tests.filter((t) => !t.category_id).length})`} />
                )}
              </div>
            </div>

            <section>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(filtered ?? []).map((t) => (
                  <MockCard key={t.id} t={t} autoOpen={t.id === sharedMockId} state={attempts[t.id]} />
                ))}
              </div>
              {filtered && filtered.length === 0 && (
                <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No mocks in this category yet.</CardContent></Card>
              )}
            </section>

          </div>
        )}
    </PageShell>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}


const RULES: string[] = [
  "The test runs in NTA-style CBT mode with a countdown timer. It auto-submits when the timer hits zero.",
  "Questions are ordered Physics → Chemistry → Biology, exactly like the real NEET paper.",
  "Use the question palette to jump between questions, mark questions for review and track your progress.",
  "Each question has a single correct option. Once submitted, answers cannot be changed.",
  "Keep the tab open for the full duration — leaving the test does not pause the timer.",
];

function MockCard({ t, autoOpen, state }: { t: Test; autoOpen?: boolean; state?: AttemptState }) {
  const [open, setOpen] = useState(!!autoOpen);
  const [starting, setStarting] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const nav = useNavigate();
  const syl = Array.isArray(t.syllabus) ? t.syllabus : [];
  const chapterCount = syl.reduce((n, s) => n + (s.chapters?.length ?? 0), 0);
  const gate = useServerFn(startMockAttempt);

  const handleStart = () => {
    // Ask the student for quiz-vs-CBT mode, matching Daily DPP flow.
    setOpen(false);
    setPickMode(true);
  };

  const startWithMode = async (mode: QuizMode) => {
    setStarting(true);
    try {
      await gate({ data: { test_id: t.id } });
      setPickMode(false);
      nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start this mock");
    } finally {
      setStarting(false);
    }
  };

  const handleShare = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/mocks?mock=${t.id}`
        : "";
    const payload = {
      title: t.title,
      text: `${t.title} — ${t.total_questions} questions in ${t.duration_min} min on Neet Buddy. Can you beat my score?`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share(payload);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Mock link copied to clipboard");
      }
    } catch {
      /* share cancelled */
    }
  };

  return (
    <Card className="hover-lift">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="capitalize">{t.difficulty}</Badge>
          <Badge variant="secondary">{t.source}</Badge>
          {t.is_paid ? <Badge className="bg-gradient-accent">₹{t.entry_fee}</Badge> : <Badge className="bg-success/15 text-success">Free</Badge>}
          <AttemptBadge state={state} />
        </div>
        <div className="text-base font-semibold leading-tight">{t.title}</div>
        {t.description && <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{t.total_questions} Qs</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t.duration_min} min</span>
          {chapterCount > 0 && <span className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{chapterCount} chapters</span>}
        </div>

        <div className="flex items-center gap-2">
          <AttemptActions
            state={state}
            onStart={() => setOpen(true)}
            startLabel="Attempt mock"
            className="flex-1"
          />
          <Button variant="outline" size="icon" aria-label="Share this mock" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>

      </CardContent>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle className="pr-8 text-base leading-snug">{t.title}</SheetTitle>
            <SheetDescription className="text-xs">
              Read the instructions and syllabus before you begin. The test opens in NTA-style CBT mode.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 pb-24">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Questions" value={String(t.total_questions)} />
              <Stat label="Duration" value={`${t.duration_min} min`} />
              <Stat label="Difficulty" value={t.difficulty} />
            </div>

            <section className="rounded-lg border bg-secondary/30 p-3">
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Marking scheme
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md border bg-card p-2">
                  <div className="text-sm font-bold text-success">+4</div>
                  <div className="text-muted-foreground">Correct</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-sm font-bold text-destructive">−1</div>
                  <div className="text-muted-foreground">Wrong</div>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <div className="text-sm font-bold">0</div>
                  <div className="text-muted-foreground">Unattempted</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Maximum marks: {t.total_questions * 4}. Negative marking applies to every wrong answer, so skip what you truly don&apos;t know.
              </p>
            </section>

            <section className="rounded-lg border p-3">
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Rules & instructions
              </h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {RULES.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border p-3">
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" /> Syllabus {chapterCount > 0 && `(${chapterCount} chapters)`}
              </h3>
              {syl.length === 0 ? (
                <p className="text-xs text-muted-foreground">Full NEET syllabus as per the latest NTA / NCERT curriculum.</p>
              ) : (
                <div className="space-y-3">
                  {syl.map((s) => (
                    <div key={s.subjectId}>
                      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {s.subjectName} · {s.chapters?.length ?? 0}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(s.chapters ?? []).map((c) => (
                          <Badge key={c.id} variant="outline" className="font-normal">{c.name}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Chapters removed from the NTA syllabus are excluded — no question in this mock comes from deleted chapters or topics.
              </p>
            </section>
          </div>

          <div className="sticky bottom-0 -mx-6 flex gap-2 border-t bg-background/95 px-6 py-3 backdrop-blur">
            <Button variant="outline" onClick={handleShare} className="gap-1.5">
              <Share2 className="h-4 w-4" /> Share
            </Button>
            <Button onClick={handleStart} disabled={starting} className="flex-1 bg-gradient-primary">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start test"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <QuizModePicker
        open={pickMode}
        subtitle={t.title}
        onClose={() => setPickMode(false)}
        onPick={startWithMode}
        busy={starting}
      />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-2 text-center">
      <div className="text-sm font-bold capitalize">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

