import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Loader2, RefreshCw, Play, MoreVertical, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { SafeRichText as RichText } from "@/components/safe-rich-text";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { createMistakesTest } from "@/lib/trial-limits.functions";
import { toast } from "sonner";
import { attachQuestionMedia } from "@/lib/question-media";

export const Route = createFileRoute("/mistakes")({
  head: () => ({
    meta: [
      { title: "My Mistakes — Retest Every Wrong Question | Neet Buddy" },
      {
        name: "description",
        content:
          "Every NEET question you got wrong, grouped by subject and chapter. Review explanations and turn your mistakes into a quiz or CBT-mode test.",
      },
      { property: "og:title", content: "My Mistakes — Neet Buddy" },
      {
        property: "og:description",
        content: "Review and retest every wrong question in quiz or CBT mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MistakesPage,
});

type Row = {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  difficulty: string;
  subject_id: string | null;
  chapter_id: string | null;
};

function MistakesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [chapters, setChapters] = useState<Record<string, string>>({});
  const [subjFilter, setSubjFilter] = useState<string>("all");
  const [chapFilter, setChapFilter] = useState<string>("all");
  const [busy, setBusy] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [pickMode, setPickMode] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  const load = async (uid: string) => {
    setBusy(true);
    const { data: wq } = await supabase
      .from("wrong_questions")
      .select("question_id,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = [...new Set((wq ?? []).map((r) => r.question_id))];
    if (!ids.length) {
      setRows([]);
      setSubjects({});
      setChapters({});
      setBusy(false);
      return;
    }
    const { data: qs } = await supabase
      .from("questions")
      .select("id,text,options,correct_index,explanation,difficulty,subject_id,chapter_id")
      .in("id", ids);
    // Preserve most-recent-first order using wq order
    const qMap = new Map((qs ?? []).map((q) => [q.id, q]));
    const list = (ids.map((id) => qMap.get(id)).filter(Boolean) as Row[]).map((q) => attachQuestionMedia(q));
    setRows(list);
    const subjIds = [...new Set(list.map((q) => q.subject_id).filter(Boolean))] as string[];
    const chapIds = [...new Set(list.map((q) => q.chapter_id).filter(Boolean))] as string[];
    const [{ data: subs }, { data: chs }] = await Promise.all([
      subjIds.length ? supabase.from("subjects").select("id,name").in("id", subjIds) : Promise.resolve({ data: [] }),
      chapIds.length ? supabase.from("chapters").select("id,name").in("id", chapIds) : Promise.resolve({ data: [] }),
    ]);
    setSubjects(Object.fromEntries((subs ?? []).map((s: { id: string; name: string }) => [s.id, s.name])));
    setChapters(Object.fromEntries((chs ?? []).map((c: { id: string; name: string }) => [c.id, c.name])));
    setBusy(false);
  };

  useEffect(() => {
    if (user) load(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const bySubject = useMemo(
    () => (subjFilter === "all" ? rows : rows.filter((r) => r.subject_id === subjFilter)),
    [rows, subjFilter],
  );
  const filtered = useMemo(
    () => (chapFilter === "all" ? bySubject : bySubject.filter((r) => r.chapter_id === chapFilter)),
    [bySubject, chapFilter],
  );
  const chapterOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of bySubject) {
      if (!r.chapter_id) continue;
      seen.set(r.chapter_id, (seen.get(r.chapter_id) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [bySubject]);
  const subjectOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (!r.subject_id) continue;
      seen.set(r.subject_id, (seen.get(r.subject_id) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const markLearnt = async (qid: string) => {
    if (!user) return;
    await supabase.from("wrong_questions").delete().eq("user_id", user.id).eq("question_id", qid);
    setRows((rs) => rs.filter((r) => r.id !== qid));
    toast.success("Marked as learnt");
  };

  const createMisTest = useServerFn(createMistakesTest);
  const startPractice = async (mode: QuizMode) => {
    if (!user || !filtered.length) return;
    setLaunching(true);
    const ids = filtered.slice(0, 180).map((q) => q.id);
    const label =
      subjFilter !== "all" ? `${subjects[subjFilter] ?? "My"} Mistakes` : "My Mistakes";
    const title = chapFilter !== "all" ? `${chapters[chapFilter] ?? label} — Mistakes Retest` : `${label} Retest`;
    try {
      const r = await createMisTest({ data: { question_ids: ids, title } });
      setLaunching(false);
      setPickMode(false);
      nav({ to: "/quiz/$testId", params: { testId: r.testId }, search: { mode } });
    } catch (e) {
      setLaunching(false);
      toast.error(e instanceof Error ? e.message : "Could not start the test");
    }
  };

  if (loading || busy) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Revise"
      title="My Mistakes"
      description="Every question you got wrong across all attempts. Review the explanation, then retest yourself on exactly these questions."
    >
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={subjFilter}
            onValueChange={(v) => {
              setSubjFilter(v);
              setChapFilter("all");
            }}
          >
            <SelectTrigger className="h-9 w-auto min-w-[130px] rounded-full text-sm">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects ({rows.length})</SelectItem>
              {subjectOptions.map(([id, n]) => (
                <SelectItem key={id} value={id}>
                  {subjects[id] ?? "Subject"} ({n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {chapterOptions.length > 1 && (
            <Select value={chapFilter} onValueChange={setChapFilter}>
              <SelectTrigger className="h-9 w-auto min-w-[150px] max-w-[240px] rounded-full text-sm">
                <SelectValue placeholder="Chapter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chapters</SelectItem>
                {chapterOptions.map(([id, n]) => (
                  <SelectItem key={id} value={id}>
                    {chapters[id] ?? "Chapter"} ({n})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button size="sm" variant="ghost" className="h-9" onClick={() => setShowAnswers((s) => !s)}>
            {showAnswers ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {showAnswers ? "Hide answers" : "Show answers"}
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={() => user && load(user.id)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>

          {filtered.length > 0 && (
            <Button
              size="sm"
              className="ml-auto h-9 rounded-full bg-gradient-primary"
              onClick={() => setPickMode(true)}
              disabled={launching}
            >
              {launching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Play className="mr-1.5 h-4 w-4" /> Retest ({Math.min(filtered.length, 180)})
                </>
              )}
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              No mistakes here — keep practicing! Wrong answers from quizzes, mock tests and CBT
              papers land here automatically.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filtered.map((q, i) => (
              <Card key={q.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">Q{i + 1}</Badge>
                    {subjects[q.subject_id ?? ""] && <Badge variant="outline">{subjects[q.subject_id ?? ""]}</Badge>}
                    {chapters[q.chapter_id ?? ""] && <Badge variant="outline">{chapters[q.chapter_id ?? ""]}</Badge>}
                    <Badge variant="outline">{q.difficulty}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="ml-auto h-8 w-8 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => markLearnt(q.id)}>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> I've learnt this
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="text-sm font-medium">
                    <RichText>{q.text}</RichText>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((opt, oi) => (
                      <div
                        key={oi}
                        className={`rounded-lg border p-2 text-sm ${
                          showAnswers && oi === q.correct_index
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-border"
                        }`}
                      >
                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + oi)}.</span>
                        <RichText>{opt}</RichText>
                      </div>
                    ))}
                  </div>
                  {showAnswers && q.explanation && (
                    <div className="rounded-lg bg-muted/60 p-3 text-sm">
                      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Explanation
                      </div>
                      <RichText>{q.explanation}</RichText>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <QuizModePicker
        open={pickMode}
        busy={launching}
        subtitle={`Retest ${Math.min(filtered.length, 180)} of your wrong questions.`}
        onClose={() => setPickMode(false)}
        onPick={startPractice}
      />
    </PageShell>
  );
}
