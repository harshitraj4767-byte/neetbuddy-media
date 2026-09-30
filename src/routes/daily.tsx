import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { startDppAttempt } from "@/lib/dpp-gate.functions";
import { getDppTests, type DppTestDTO } from "@/lib/dpp-mysql.functions";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Clock, FileText, CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAttemptStates } from "@/hooks/use-attempt-state";
import { AttemptActions, AttemptBadge } from "@/components/attempt-actions";

type Test = DppTestDTO;

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
  const fetchTests = useServerFn(getDppTests);
  const allIds = useMemo(
    () => [...(today ? [today.id] : []), ...past.map((p) => p.id)],
    [today, past],
  );
  const { attempts } = useAttemptStates(allIds);

  async function startWithMode(test: Test, mode: QuizMode) {
    if (gating) return;
    setGating(true);
    try {
      try {
        await startGate({ data: { test_id: test.id } });
      } catch (ignore) {}
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
    (async () => {
      try {
        const data = await fetchTests({ data: { userId: user?.id ?? null } });
        const list = (data?.tests ?? []) as Test[];
        const todayStr = new Date().toDateString();
        const latest = list[0];
        const isToday = latest && new Date(latest.created_at).toDateString() === todayStr;
        setToday(isToday ? latest : (latest || null));
        setPast(isToday ? list.slice(1) : list);
      } catch (e) {
        console.warn("Failed to load DPP tests:", e);
        setToday(null);
        setPast([]);
      }
    })();
  }, [user?.id]);

  return (
    <PageShell eyebrow="Free everyday" title="Daily quiz" description="Stay sharp with a free quiz, refreshed daily.">
      {today === undefined ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : !today ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No daily quiz yet. Check back soon.</CardContent></Card>
      ) : (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Today's DPP</Badge>
              <Badge variant="outline" className="capitalize">{today.difficulty}</Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{today.duration_min}m</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />{today.total_questions}Q</span>
              <AttemptBadge attempt={attempts[today.id]} />
            </div>
            <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">{today.title}</h2>
            {today.description && <p className="mt-1 text-sm text-muted-foreground">{today.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <AttemptActions
                testId={today.id}
                attempt={attempts[today.id]}
                onStart={() => setModePick(today)}
                resumeTo={`/quiz/${today.id}`}
                gating={gating}
                size="default"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Past DPPs ({past.length})
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {past.map((t) => (
              <Card key={t.id} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize text-xs">{t.difficulty}</Badge>
                      <AttemptBadge attempt={attempts[t.id]} />
                    </div>
                  </div>
                  <h3 className="font-semibold leading-snug line-clamp-1">{t.title}</h3>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">{t.total_questions} questions · {t.duration_min}m</span>
                    <AttemptActions
                      testId={t.id}
                      attempt={attempts[t.id]}
                      onStart={() => setModePick(t)}
                      resumeTo={`/quiz/${t.id}`}
                      gating={gating}
                      size="sm"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
