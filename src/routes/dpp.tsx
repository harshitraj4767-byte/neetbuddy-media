import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RotateCw, Eye, FileText, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { startDppAttempt } from "@/lib/dpp-gate.functions";
import { getDppTests, type DppTestDTO } from "@/lib/dpp-mysql.functions";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/dpp")({
  head: () => ({ meta: [{ title: "DPP & Quiz — Neet Buddy" }] }),
  component: DppPage,
});

type Test = DppTestDTO;
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
  const fetchTests = useServerFn(getDppTests);
  const [modePick, setModePick] = useState<Test | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchTests({ data: { userId: user?.id ?? null } });
        if (Array.isArray(data?.tests)) {
          setTests(data.tests as Test[]);
          if (data.attempts && typeof data.attempts === "object") {
            setAttempts(data.attempts as Record<string, Attempt>);
          }
          return;
        }
      } catch (e) {
        console.warn("Failed to load DPP tests:", e);
      }
      setTests([]);
    })();
  }, [user?.id]);

  async function startWithMode(t: Test, mode: QuizMode) {
    if (gating) return;
    setGating(t.id);
    try {
      try {
        await startGate({ data: { test_id: t.id } });
      } catch (ignore) {}
      setModePick(null);
      nav({ to: "/quiz/$testId", params: { testId: t.id }, search: { mode } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start DPP");
    } finally {
      setGating(null);
    }
  }

  const filtered = useMemo(() => {
    if (!tests) return [];
    const q = query.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => t.title.toLowerCase().includes(q));
  }, [tests, query]);

  if (loading || tests === null) {
    return <LoadingScreen message="Loading practice problems..." />;
  }

  return (
    <PageShell eyebrow="Daily practice" title="Daily Practice Problems" description="Curated problem sets for daily NEET preparation across Physics, Chemistry, and Biology.">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search DPP by topic or number..."
            className="pl-9 pr-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-sm font-medium text-muted-foreground">
          Showing {filtered.length} of {tests.length} DPPs
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No DPPs found matching your search.</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const attempt = attempts[t.id];
            const isCompleted = attempt?.status === "completed";
            return (
              <Card key={t.id} className="flex flex-col justify-between hover:border-primary/40 transition-colors">
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize text-xs">{t.difficulty}</Badge>
                      <span className="text-xs text-muted-foreground">{t.duration_min} mins · {t.total_questions} Qs</span>
                    </div>
                    <h3 className="font-semibold text-base leading-snug line-clamp-2">{t.title}</h3>
                    {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      {isCompleted ? <Badge variant="secondary" className="text-xs">Attempted</Badge> : "+4 / -1 NEET"}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setModePick(t)}
                      disabled={gating === t.id}
                      className="gap-1.5"
                    >
                      {gating === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isCompleted ? <RotateCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {isCompleted ? "Reattempt" : "Start DPP"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <QuizModePicker
        open={Boolean(modePick)}
        onOpenChange={(open) => { if (!open) setModePick(null); }}
        onSelect={(mode) => { if (modePick) void startWithMode(modePick, mode); }}
        title={modePick?.title}
        totalQuestions={modePick?.total_questions}
        durationMin={modePick?.duration_min}
      />
    </PageShell>
  );
}
