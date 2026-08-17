import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { startDppAttempt } from "@/lib/dpp-gate.functions";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clock, FileText, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAttemptStates } from "@/hooks/use-attempt-state";
import { AttemptActions, AttemptBadge } from "@/components/attempt-actions";

type Test = { id: string; title: string; description: string | null; difficulty: string; duration_min: number; total_questions: number; source: string; created_at: string };

export const Route = createFileRoute("/daily")({
  head: () => ({ meta: [{ title: "Daily Free Quiz — Neet Buddy" }, { name: "description", content: "A fresh free NEET quiz every day. 10 questions, 15 minutes." }] }),
  component: DailyPage,
});

function DailyPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [today, setToday] = useState<Test | null | undefined>(undefined);
  const [past, setPast] = useState<Test[]>([]);
  const [modePick, setModePick] = useState<Test | null>(null);
  const [gating, setGating] = useState(false);
  const startGate = useServerFn(startDppAttempt);
  const allIds = useMemo(
    () => [...(today ? [today.id] : []), ...past.map((p) => p.id)],
    [today, past],
  );
  const { attempts } = useAttemptStates(allIds);

  // Every DPP launch goes through the mode chooser so the student picks
  // Quiz mode (explanations inline) or CBT mode (timed, NTA-like).
  async function startWithMode(test: Test, mode: QuizMode) {
    if (gating) return;
    setGating(true);
    try {
      await startGate({ data: { test_id: test.id } });
      setModePick(null);
      nav({ to: "/quiz/$testId", params: { testId: test.id }, search: { mode } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start this quiz");
    } finally {
      setGating(false);
    }
  }

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    // Show EVERY DPP-style test (daily, quiz, dpp, generated) in the Daily DPP feed.
    supabase.from("tests").select("id,title,description,difficulty,duration_min,total_questions,source,created_at,type")
      .in("type", ["daily", "quiz", "dpp", "generated"]).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => {
        const list = (data ?? []) as Test[];
        const todayStr = new Date().toDateString();
        const latest = list[0];
        const isToday = latest && new Date(latest.created_at).toDateString() === todayStr;
        setToday(isToday ? latest : null);
        setPast(isToday ? list.slice(1) : list);
      });
  }, []);

  return (
    <PageShell eyebrow="Free everyday" title="Daily quiz" description="Stay sharp with a free quiz, refreshed daily.">
      {today === undefined ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : !today ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No daily quiz yet. Check back soon.</CardContent></Card>
      ) : (
        <Card className="overflow-hidden border-primary/25 shadow-soft">
          <div className="bg-gradient-to-br from-primary/90 via-accent/80 to-primary/75 p-6 text-primary-foreground sm:p-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Today
            </div>
            <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{today.title}</h2>
            {today.description && <p className="mt-2 max-w-xl text-sm opacity-90">{today.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm opacity-90">
              <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" />{today.total_questions} Qs</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{today.duration_min} min</span>
              <Badge className="bg-white/20 capitalize">{today.difficulty}</Badge>
              <Badge className="bg-white/20">{today.source}</Badge>
              {attempts[today.id]?.status === "in_progress" && <Badge className="bg-white/20">In progress</Badge>}
              {attempts[today.id] && attempts[today.id]!.status !== "in_progress" && (
                <Badge className="bg-white/20">
                  Attempted{attempts[today.id]!.score !== null ? ` · ${attempts[today.id]!.score}` : ""}
                </Badge>
              )}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                size="lg"
                className="bg-background text-foreground hover:bg-background/90"
                onClick={() => setModePick(today)}
              >
                {!attempts[today.id]
                  ? "Start now"
                  : attempts[today.id]!.status === "in_progress"
                    ? "Resume"
                    : "Reattempt"}
              </Button>
              {attempts[today.id] && attempts[today.id]!.status !== "in_progress" && (
                <Button asChild size="lg" variant="outline" className="border-white/50 bg-white/10 text-primary-foreground hover:bg-white/20">
                  <Link to="/analysis/$attemptId" params={{ attemptId: attempts[today.id]!.attemptId }}>
                    View solution
                  </Link>
                </Button>
              )}
            </div>

          </div>
        </Card>
      )}

      {past.length > 0 && (
        <div className="mt-10">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Previous quizzes</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((t) => (
              <Card key={t.id} className="hover-lift">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                    <AttemptBadge state={attempts[t.id]} />
                  </div>
                  <div className="text-base font-semibold leading-tight">{t.title}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{t.total_questions} Qs</span><span>·</span><span>{t.duration_min} min</span>
                  </div>
                  <AttemptActions state={attempts[t.id]} onStart={() => setModePick(t)} size="sm" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <QuizModePicker
        open={!!modePick}
        subtitle={modePick?.title}
        onClose={() => setModePick(null)}
        onPick={(m) => modePick && startWithMode(modePick, m)}
        busy={gating}
      />
    </PageShell>
  );
}
