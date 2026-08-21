import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, CheckCircle2, XCircle, MinusCircle, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LoadingScreen } from "@/components/loading-screen";

type Attempt = { id: string; test_id: string; score: number; correct_count: number; wrong_count: number; unattempted_count: number; submitted_at: string | null; time_taken_sec: number | null };
type Test = { id: string; title: string; type: string };

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Neet Buddy" }, { name: "description", content: "Track your accuracy, scores and progress across attempts." }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [tests, setTests] = useState<Record<string, Test>>({});

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ats } = await supabase.from("attempts")
        .select("id,test_id,score,correct_count,wrong_count,unattempted_count,submitted_at,time_taken_sec")
        .eq("user_id", user.id).eq("status", "completed").order("submitted_at", { ascending: false }).limit(50);
      const list = (ats ?? []) as Attempt[];
      setAttempts(list);
      const ids = [...new Set(list.map((a) => a.test_id))];
      if (ids.length) {
        const { data: ts } = await supabase.from("tests").select("id,title,type").in("id", ids);
        const map: Record<string, Test> = {};
        (ts ?? []).forEach((t) => { map[t.id] = t as Test; });
        setTests(map);
      }
    })();
  }, [user]);

  if (attempts === null) return <PageShell title="Analytics"><LoadingScreen variant="analysis" fullScreen={false} /></PageShell>;

  const totalC = attempts.reduce((s, a) => s + (a.correct_count ?? 0), 0);
  const totalW = attempts.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
  const totalU = attempts.reduce((s, a) => s + (a.unattempted_count ?? 0), 0);
  const totalQ = totalC + totalW + totalU;
  const accuracy = totalC + totalW > 0 ? Math.round((totalC / (totalC + totalW)) * 100) : 0;
  const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + Number(a.score ?? 0), 0) / attempts.length) : 0;

  return (
    <PageShell eyebrow="Insights" title="Your analytics" description="Accuracy, scores, and trends across attempts.">
      {attempts.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          No attempts yet. <Link to="/mocks" search={{ mock: undefined }} className="text-primary underline">Try a mock</Link> or <Link to="/daily" className="text-primary underline">today's quiz</Link>.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Target} label="Accuracy" value={`${accuracy}%`} />
            <Stat icon={TrendingUp} label="Avg score" value={`${avgScore}`} />
            <Stat icon={CheckCircle2} label="Attempts" value={`${attempts.length}`} />
            <Stat icon={MinusCircle} label="Questions" value={`${totalQ}`} />
          </div>

          <div className="mt-10">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Recent attempts</h3>
            <div className="grid gap-2">
              {attempts.map((a) => {
                const t = tests[a.test_id];
                const att = (a.correct_count ?? 0) + (a.wrong_count ?? 0);
                const acc = att ? Math.round(((a.correct_count ?? 0) / att) * 100) : 0;
                return (
                  <Link key={a.id} to="/analysis/$attemptId" params={{ attemptId: a.id }} className="block">
                    <Card className="hover-lift">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{t?.title ?? "Test"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {t && <Badge variant="secondary" className="capitalize">{t.type}</Badge>}
                            <span>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : ""}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{a.correct_count ?? 0}</span>
                          <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" />{a.wrong_count ?? 0}</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><MinusCircle className="h-3.5 w-3.5" />{a.unattempted_count ?? 0}</span>
                          <Badge>{acc}%</Badge>
                          <Badge variant="outline">Score {Number(a.score ?? 0)}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <Button asChild variant="outline"><Link to="/mocks" search={{ mock: undefined }}>Take another mock</Link></Button>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card className="hover-lift">
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow"><Icon className="h-5 w-5" /></div>
        <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold">{value}</div></div>
      </CardContent>
    </Card>
  );
}
