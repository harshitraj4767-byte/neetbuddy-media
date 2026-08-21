import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RotateCw, Eye, FileText, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { startDppAttempt } from "@/lib/dpp-gate.functions";
import { toast } from "sonner";
import { QuizModePicker } from "@/components/quiz-mode-picker";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/dpp")({
  head: () => ({ meta: [{ title: "DPP & Quiz — Neet Buddy" }] }),
  component: DppPage,
});

type Test = { id: string; title: string; difficulty: string; total_questions: number; duration_min: number; marks_correct: number; created_at: string; starts_at: string | null; ends_at: string | null; type: string };
type Attempt = { id: string; test_id: string; status: string };

function DppPage() {
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [tests, setTests] = useState<Test[] | null>(null);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [now, setNow] = useState(() => Date.now());
  const [gating, setGating] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const startGate = useServerFn(startDppAttempt);
  const [modePick, setModePick] = useState<Test | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tests").select("id,title,difficulty,total_questions,duration_min,marks_correct,created_at,starts_at,ends_at,type")
        .in("type", ["daily", "quiz"]).order("created_at", { ascending: false });
      setTests((t ?? []) as Test[]);
      if (user) {
        const { data: a } = await supabase.from("attempts").select("id,test_id,status").eq("user_id", user.id).order("started_at", { ascending: false });
        const map: Record<string, Attempt> = {};
        (a ?? []).forEach((row) => { if (!map[row.test_id]) map[row.test_id] = row as Attempt; });
        setAttempts(map);
      }
    })();
  }, [user]);

  async function startWithMode(t: Test, mode: "quiz" | "cbt") {
    if (gating) return;
    setGating(t.id);
    setModePick(null);
    try {
      await startGate({ data: { test_id: t.id } });
      nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start DPP");
    } finally {
      setGating(null);
    }
  }
  function attemptDpp(t: Test) { setModePick(t); }

  const filtered = useMemo(() => {
    if (!tests) return tests;
    const q = query.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.difficulty.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q),
    );
  }, [tests, query]);

  return (
    <>
    <PageShell eyebrow="Practice" title="All DPP & Quiz" description="Daily Practice Problems and topic quizzes.">
      <div className="mb-3 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, difficulty, or type…"
          className="pl-9 pr-9"
          aria-label="Search DPPs"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {tests === null ? <LoadingScreen variant="quiz" fullScreen={false} /> :
        (filtered ?? []).length === 0 ? (
          <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
            {tests.length === 0 ? "No DPPs yet." : `No DPPs match "${query}".`}
          </CardContent></Card>
        ) :
        <div className="space-y-3">
          {(filtered ?? []).map((t) => {
            const a = attempts[t.id];
            const startMs = t.starts_at ? new Date(t.starts_at).getTime() : null;
            const endMs = t.ends_at ? new Date(t.ends_at).getTime() : null;
            const isLive = t.type === "daily" && (startMs === null || startMs <= now) && (endMs === null || endMs > now);
            const isExpired = t.type === "daily" && endMs !== null && endMs <= now;
            return (
              <Card key={t.id} className={isExpired ? "opacity-90" : undefined}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <FileText className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize">{t.difficulty}</Badge>
                      {isLive && (
                        <Badge className="gap-1 bg-destructive text-destructive-foreground">
                          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-current" /></span>
                          LIVE · FREE
                        </Badge>
                      )}
                      {isExpired && <Badge variant="outline">Ended</Badge>}
                      <span>{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold leading-tight">{t.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{t.total_questions} Qs · {t.total_questions * t.marks_correct} Marks · {t.duration_min} min</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a?.status === "completed" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={gating === t.id}
                            onClick={() => attemptDpp(t)}
                          >
                            {gating === t.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1.5 h-3.5 w-3.5" />}
                            Reattempt
                          </Button>
                          <Button asChild size="sm" className="bg-gradient-primary">
                            <Link to="/analysis/$attemptId" params={{ attemptId: a.id }}>
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> View solution
                            </Link>
                          </Button>
                        </>
                      ) : a?.status === "in_progress" ? (
                        <Button asChild size="sm" className="bg-warning text-warning-foreground hover:bg-warning/90"><Link to="/quiz/$testId" params={{ testId: t.id }} search={{ mode: "quiz" } as never}><RotateCw className="mr-1.5 h-3.5 w-3.5" /> Resume</Link></Button>
                      ) : (
                        <Button
                          size="sm"
                          className={isExpired ? "" : "bg-gradient-primary"}
                          variant={isExpired ? "outline" : "default"}
                          disabled={gating === t.id}
                          onClick={() => attemptDpp(t)}
                        >
                          {gating === t.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                          Attempt
                        </Button>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      }
    </PageShell>
    <QuizModePicker
      open={!!modePick}
      subtitle={modePick?.title}
      onClose={() => setModePick(null)}
      onPick={(m) => modePick && startWithMode(modePick, m)}
      busy={!!gating}
    />
    </>
  );
}
