import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { HubHero } from "@/components/nav-tiles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookMarked, Loader2, Search, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chapter-pyqs")({
  head: () => ({
    meta: [
      { title: "Chapter Wise PYQ — 10.2k+ NEET, JEE, AIIMS & AIPMT Questions | Neet Buddy" },
      {
        name: "description",
        content:
          "Practice 10.2k+ previous year questions arranged chapter wise from NEET, JEE, AIIMS, AIPMT, KCET, MHT CET and TS EAMCET in quiz mode or real CBT mode.",
      },
      { property: "og:title", content: "Chapter Wise PYQ — 10.2k+ Questions" },
      {
        property: "og:description",
        content:
          "Every previous year question sorted chapter wise across NEET, JEE, AIIMS, AIPMT and state exams. Attempt in quiz mode or CBT mode with full results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChapterPyqPage,
});

type ChapterRow = {
  chapter_id: number;
  subject_id: string;
  chapter_name: string;
  pyq_count: number;
  first_year: number | null;
  last_year: number | null;
};

type Mode = "quiz" | "cbt";

const SUBJECTS = [
  { id: "physics", label: "Physics", accent: "bg-blue-100 text-blue-700" },
  { id: "chemistry", label: "Chemistry", accent: "bg-emerald-100 text-emerald-700" },
  { id: "biology", label: "Biology", accent: "bg-rose-100 text-rose-700" },
] as const;

const EXAMS = ["NEET", "JEE", "AIIMS", "AIPMT", "KCET", "MHT CET", "TS EAMCET"];

/** CBT papers stay attemptable: long chapters are split into fixed-size sets. */
const CBT_SET_SIZE = 50;

function ChapterPyqPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<ChapterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("physics");
  const [query, setQuery] = useState("");
  const [launching, setLaunching] = useState<number | null>(null);
  const [cbtPlan, setCbtPlan] = useState<{ chapter: ChapterRow; qids: string[] } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await (supabase as any)
        .from("qb_pyq_chapter_counts")
        .select("chapter_id,subject_id,chapter_name,pyq_count,first_year,last_year")
        .order("pyq_count", { ascending: false });
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as ChapterRow[]);
    })().catch((e) => setError(String(e)));
  }, []);

  const total = useMemo(
    () => (rows ?? []).reduce((s, r) => s + (r.pyq_count ?? 0), 0),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => r.subject_id === subject)
      .filter((r) => (q ? r.chapter_name.toLowerCase().includes(q) : true));
  }, [rows, subject, query]);

  async function fetchPyqIds(chapterId: number) {
    const { data, error: err } = await (supabase as any)
      .from("questions")
      .select("id,year")
      .eq("chapter_id", String(chapterId))
      .eq("is_pyq", true)
      .order("year", { ascending: false })
      .limit(2000);
    if (err) throw new Error(err.message);
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  async function launch(chapter: ChapterRow, mode: Mode, qids: string[], setLabel?: string) {
    if (!user) {
      toast.error("Log in to start a PYQ session.");
      return;
    }
    const title = `PYQ · ${chapter.chapter_name}${setLabel ? ` · ${setLabel}` : ""}`;
    const { data: existing } = await supabase
      .from("tests")
      .select("id")
      .eq("created_by", user.id)
      .eq("title", title)
      .eq("type", "practice")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: uErr } = await supabase
        .from("tests")
        .update({ question_ids: qids, total_questions: qids.length })
        .eq("id", existing.id);
      if (uErr) {
        toast.error(uErr.message);
        return;
      }
      nav({ to: "/quiz/$testId", params: { testId: existing.id }, search: { mode } as never });
      return;
    }

    const { data: t, error: iErr } = await supabase
      .from("tests")
      .insert({
        title,
        type: "practice",
        difficulty: "medium",
        duration_min: Math.round(Math.max(10, Math.min(180, qids.length * 1.2))),
        total_questions: qids.length,
        question_ids: qids,
        created_by: user.id,
        source: "PYQ",
      })
      .select("id")
      .maybeSingle();
    if (iErr || !t) {
      toast.error(iErr?.message ?? "Could not start this PYQ set.");
      return;
    }
    nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
  }

  async function start(chapter: ChapterRow, mode: Mode) {
    setLaunching(chapter.chapter_id);
    try {
      const qids = await fetchPyqIds(chapter.chapter_id);
      if (!qids.length) {
        toast.error("No PYQs found for this chapter yet.");
        return;
      }
      if (mode === "cbt" && qids.length > CBT_SET_SIZE) {
        setCbtPlan({ chapter, qids });
        return;
      }
      await launch(chapter, mode, qids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start this PYQ set.");
    } finally {
      setLaunching(null);
    }
  }

  return (
    <PageShell>
      <HubHero
        variant="banner"
        compact
        eyebrow="Previous Years · Chapter wise"
        title="Chapter Wise PYQ"
        highlight={`${total ? (total / 1000).toFixed(1) : "10.2"}k questions`}
        description="Every previous year question arranged chapter wise across NEET, JEE, AIIMS, AIPMT and major state exams. Pick a chapter and attempt it in quiz mode or full CBT mode with detailed results."
        Icon={BookMarked}
        accent="violet"
      >
        {EXAMS.map((e) => (
          <span
            key={e}
            className="mr-1.5 inline-flex items-center rounded-full bg-background/70 px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur"
          >
            {e}
          </span>
        ))}
      </HubHero>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SUBJECTS.map((s) => {
          const count = (rows ?? [])
            .filter((r) => r.subject_id === s.id)
            .reduce((a, r) => a + r.pyq_count, 0);
          return (
            <button
              key={s.id}
              onClick={() => setSubject(s.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                subject === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              {s.label}
              {count ? <span className="ml-1.5 opacity-70">{count}</span> : null}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chapter"
            className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {rows === null && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading chapters…
        </div>
      )}

      {rows !== null && !error && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <Card key={c.chapter_id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold leading-snug">{c.chapter_name}</h2>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {c.pyq_count} PYQ
                  </Badge>
                </div>
                {c.first_year && c.last_year && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {c.first_year}–{c.last_year}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={launching === c.chapter_id}
                    onClick={() => start(c, "quiz")}
                  >
                    {launching === c.chapter_id ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="mr-1 h-3.5 w-3.5" />
                    )}
                    Quiz mode
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={launching === c.chapter_id}
                    onClick={() => start(c, "cbt")}
                  >
                    <Timer className="mr-1 h-3.5 w-3.5" />
                    CBT mode
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {!visible.length && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardContent className="p-6 text-sm text-muted-foreground">
                No chapters match this search.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!cbtPlan} onOpenChange={(o) => !o && setCbtPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cbtPlan?.chapter.chapter_name}</DialogTitle>
            <DialogDescription>
              {cbtPlan?.qids.length} PYQs in this chapter. Pick a set of {CBT_SET_SIZE} to attempt as
              a timed CBT paper.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {cbtPlan &&
              Array.from({ length: Math.ceil(cbtPlan.qids.length / CBT_SET_SIZE) }).map((_, i) => {
                const slice = cbtPlan.qids.slice(i * CBT_SET_SIZE, (i + 1) * CBT_SET_SIZE);
                return (
                  <Button
                    key={i}
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const plan = cbtPlan;
                      setCbtPlan(null);
                      await launch(plan.chapter, "cbt", slice, `Set ${i + 1}`);
                    }}
                  >
                    Set {i + 1} · {slice.length}Q
                  </Button>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
