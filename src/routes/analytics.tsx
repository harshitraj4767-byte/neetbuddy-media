import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Target, CheckCircle2, XCircle, MinusCircle, TrendingUp, Flame,
  BarChart3, AlertTriangle, ChevronRight, Sparkles, Timer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LoadingScreen } from "@/components/loading-screen";
import { cn } from "@/lib/utils";

type Attempt = { id: string; test_id: string; score: number; correct_count: number; wrong_count: number; unattempted_count: number; submitted_at: string | null; time_taken_sec: number | null };
type Test = { id: string; title: string; type: string };
type AnswerRow = { question_id: string; is_correct: boolean | null; selected_index: number | null };
type QRow = { id: string; subject_id: string | null; chapter_id: string | null; difficulty: string | null };

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Performance Analytics — Neet Buddy" },
      { name: "description", content: "Subject-wise accuracy, difficulty breakdown, weak chapters and every past test in one professional dashboard." },
      { property: "og:title", content: "Performance Analytics — Neet Buddy" },
      { property: "og:description", content: "Subject-wise accuracy, difficulty breakdown, weak chapters and every past test." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

const SUBJECT_TONE: Record<string, { bar: string; ring: string }> = {
  physics: { bar: "from-blue-500 to-indigo-500", ring: "text-blue-500" },
  chemistry: { bar: "from-orange-500 to-amber-500", ring: "text-orange-500" },
  biology: { bar: "from-emerald-500 to-teal-500", ring: "text-emerald-500" },
  botany: { bar: "from-emerald-500 to-lime-500", ring: "text-emerald-500" },
  zoology: { bar: "from-teal-500 to-cyan-500", ring: "text-teal-500" },
};
const toneFor = (name: string) =>
  SUBJECT_TONE[name.toLowerCase()] ?? { bar: "from-violet-500 to-fuchsia-500", ring: "text-violet-500" };

const DIFF_TONE: Record<string, string> = {
  easy: "from-emerald-500 to-teal-500",
  medium: "from-amber-500 to-orange-500",
  hard: "from-rose-500 to-red-500",
};

function AnalyticsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [tests, setTests] = useState<Record<string, Test>>({});
  const [subjectStats, setSubjectStats] = useState<{ name: string; correct: number; total: number }[]>([]);
  const [diffStats, setDiffStats] = useState<{ name: string; correct: number; total: number }[]>([]);
  const [weak, setWeak] = useState<{ id: string; name: string; subject: string; wrong: number; total: number }[]>([]);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ats } = await supabase.from("attempts")
        .select("id,test_id,score,correct_count,wrong_count,unattempted_count,submitted_at,time_taken_sec")
        .eq("user_id", user.id).eq("status", "completed").order("submitted_at", { ascending: false }).limit(50);
      const list = (ats ?? []) as Attempt[];
      setAttempts(list);
      if (!list.length) return;

      const ids = [...new Set(list.map((a) => a.test_id))];
      const { data: ts } = await supabase.from("tests").select("id,title,type").in("id", ids);
      const tmap: Record<string, Test> = {};
      (ts ?? []).forEach((t) => { tmap[t.id] = t as Test; });
      setTests(tmap);

      // Deep breakdown from answered questions
      const { data: ansRaw } = await (supabase as any).from("attempt_answers")
        .select("question_id,is_correct,selected_index")
        .in("attempt_id", list.slice(0, 25).map((a) => a.id));
      const answers = (ansRaw ?? []) as unknown as AnswerRow[];
      if (!answers.length) return;
      const qIds = [...new Set(answers.map((a) => a.question_id))].slice(0, 1500);
      const { data: qsRaw } = await supabase.from("questions")
        .select("id,subject_id,chapter_id,difficulty").in("id", qIds);
      const qs = (qsRaw ?? []) as unknown as QRow[];
      const qmap: Record<string, QRow> = {};
      qs.forEach((q) => { qmap[q.id] = q; });

      const subIds = [...new Set(qs.map((q) => q.subject_id).filter(Boolean))] as string[];
      const chapIds = [...new Set(qs.map((q) => q.chapter_id).filter(Boolean))] as string[];
      const [{ data: subs }, { data: chaps }] = await Promise.all([
        subIds.length ? supabase.from("subjects").select("id,name").in("id", subIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        chapIds.length ? supabase.from("chapters").select("id,name,subject_id").in("id", chapIds) : Promise.resolve({ data: [] as { id: string; name: string; subject_id?: string }[] }),
      ]);
      const sName: Record<string, string> = {};
      (subs ?? []).forEach((s) => { sName[s.id] = s.name; });
      const cInfo: Record<string, { name: string; subject: string }> = {};
      (chaps ?? []).forEach((c: { id: string; name: string; subject_id?: string }) => {
        cInfo[c.id] = { name: c.name, subject: (c.subject_id && sName[c.subject_id]) || "" };
      });

      const bySub: Record<string, { correct: number; total: number }> = {};
      const byDiff: Record<string, { correct: number; total: number }> = {};
      const byChap: Record<string, { name: string; subject: string; wrong: number; total: number }> = {};
      answers.forEach((a) => {
        const q = qmap[a.question_id];
        if (!q) return;
        const ok = !!a.is_correct;
        const s = (q.subject_id && sName[q.subject_id]) || "Other";
        (bySub[s] ||= { correct: 0, total: 0 });
        bySub[s].total++; if (ok) bySub[s].correct++;
        const d = (q.difficulty || "medium").toLowerCase();
        (byDiff[d] ||= { correct: 0, total: 0 });
        byDiff[d].total++; if (ok) byDiff[d].correct++;
        if (q.chapter_id) {
          const info = cInfo[q.chapter_id] ?? { name: "Unknown chapter", subject: s };
          (byChap[q.chapter_id] ||= { name: info.name, subject: info.subject || s, wrong: 0, total: 0 });
          byChap[q.chapter_id].total++;
          if (!ok) byChap[q.chapter_id].wrong++;
        }
      });

      setSubjectStats(Object.entries(bySub).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total));
      setDiffStats(["easy", "medium", "hard"].filter((d) => byDiff[d]).map((d) => ({ name: d, ...byDiff[d] })));
      setWeak(
        Object.entries(byChap)
          .map(([id, v]) => ({ id, ...v }))
          .filter((c) => c.total >= 2 && c.wrong / c.total >= 0.34)
          .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong)
          .slice(0, 6),
      );
    })();
  }, [user]);

  if (attempts === null) return <PageShell title="Analytics"><LoadingScreen variant="analysis" fullScreen={false} /></PageShell>;

  const totalC = attempts.reduce((s, a) => s + (a.correct_count ?? 0), 0);
  const totalW = attempts.reduce((s, a) => s + (a.wrong_count ?? 0), 0);
  const totalU = attempts.reduce((s, a) => s + (a.unattempted_count ?? 0), 0);
  const totalQ = totalC + totalW + totalU;
  const accuracy = totalC + totalW > 0 ? Math.round((totalC / (totalC + totalW)) * 100) : 0;
  const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + Number(a.score ?? 0), 0) / attempts.length) : 0;
  const best = attempts.reduce((m, a) => Math.max(m, Number(a.score ?? 0)), 0);
  const timeMin = Math.round(attempts.reduce((s, a) => s + (a.time_taken_sec ?? 0), 0) / 60);

  return (
    <PageShell>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-violet-100 via-sky-50 to-blue-100 p-6 shadow-soft dark:from-violet-950/60 dark:via-slate-950/60 dark:to-blue-950/60 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Performance
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Your <span className="bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent">analysis</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Subject accuracy, difficulty breakdown, weak chapters and every past test — in one place.
            </p>
          </div>
          <img
            src="/illustrations/hub-analyse.png"
            alt="3D analytics illustration with charts and magnifier"
            loading="lazy"
            className="h-28 w-28 shrink-0 object-contain drop-shadow-xl sm:h-40 sm:w-40"
          />
        </div>
      </div>

      {attempts.length === 0 ? (
        <Card className="mt-8"><CardContent className="p-10 text-center text-sm text-muted-foreground">
          No attempts yet. <Link to="/mocks" search={{ mock: undefined }} className="text-primary underline">Try a mock</Link> or <Link to="/daily" className="text-primary underline">today's quiz</Link>.
        </CardContent></Card>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Target} label="Accuracy" value={`${accuracy}%`} sub={`${totalC} correct of ${totalC + totalW}`} />
            <Stat icon={TrendingUp} label="Avg score" value={`${avgScore}`} sub={`Best ${best}`} />
            <Stat icon={CheckCircle2} label="Tests taken" value={`${attempts.length}`} sub={`${totalQ} questions`} />
            <Stat icon={Timer} label="Time invested" value={`${timeMin}m`} sub={`${totalU} left blank`} />
          </div>

          {/* Subject-wise accuracy */}
          {subjectStats.length > 0 && (
            <Section title="Subject-wise accuracy" icon={BarChart3} note="Based on your last 25 attempts">
              <div className="grid gap-3 sm:grid-cols-2">
                {subjectStats.map((s) => {
                  const pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
                  const tone = toneFor(s.name);
                  return (
                    <Card key={s.name} className="hover-lift">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between text-sm font-semibold capitalize">
                          <span>{s.name}</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div className={cn("h-full rounded-full bg-gradient-to-r transition-all", tone.bar)} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground tabular-nums">{s.correct}/{s.total} correct</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Difficulty vs accuracy */}
          {diffStats.length > 0 && (
            <Section title="Difficulty vs accuracy" icon={Flame} note="Where your accuracy drops">
              <div className="grid gap-3 sm:grid-cols-3">
                {diffStats.map((d) => {
                  const pct = d.total ? Math.round((d.correct / d.total) * 100) : 0;
                  return (
                    <Card key={d.name} className="hover-lift">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="capitalize">{d.name}</Badge>
                          <span className="text-2xl font-bold tabular-nums">{pct}%</span>
                        </div>
                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div className={cn("h-full rounded-full bg-gradient-to-r", DIFF_TONE[d.name] ?? "from-primary to-primary")} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground tabular-nums">{d.correct}/{d.total} correct</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Weak chapters + practice */}
          {weak.length > 0 && (
            <Section title="Weak chapters" icon={AlertTriangle} note="Fix these first for the biggest score jump">
              <div className="grid gap-2">
                {weak.map((c) => {
                  const errPct = Math.round((c.wrong / c.total) * 100);
                  return (
                    <Card key={c.id} className="hover-lift border-rose-500/20">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{c.name}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {c.subject && <Badge variant="secondary" className="capitalize">{c.subject}</Badge>}
                            <span className="tabular-nums">{c.wrong} wrong of {c.total}</span>
                          </div>
                          <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-500" style={{ width: `${errPct}%` }} />
                          </div>
                        </div>
                        <Button asChild size="sm">
                          <Link to="/generate">Practice questions <ChevronRight className="h-4 w-4" /></Link>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/mistakes">Review all mistakes</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/bookmarks">Bookmarked questions</Link></Button>
              </div>
            </Section>
          )}

          {/* Previous tests */}
          <Section title="Previous tests" icon={CheckCircle2} note={`${attempts.length} completed attempts`}>
            <div className="grid gap-2">
              {attempts.map((a) => {
                const t = tests[a.test_id];
                const att = (a.correct_count ?? 0) + (a.wrong_count ?? 0);
                const acc = att ? Math.round(((a.correct_count ?? 0) / att) * 100) : 0;
                return (
                  <Link key={a.id} to="/analysis/$attemptId" params={{ attemptId: a.id }} className="block">
                    <Card className="hover-lift">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums text-primary-foreground",
                            acc >= 75 ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                              : acc >= 50 ? "bg-gradient-to-br from-amber-500 to-orange-500"
                              : "bg-gradient-to-br from-rose-500 to-red-500",
                          )}>{acc}%</div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{t?.title ?? "Test"}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {t && <Badge variant="secondary" className="capitalize">{t.type}</Badge>}
                              <span>{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{a.correct_count ?? 0}</span>
                          <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" />{a.wrong_count ?? 0}</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><MinusCircle className="h-3.5 w-3.5" />{a.unattempted_count ?? 0}</span>
                          <Badge variant="outline">Score {Number(a.score ?? 0)}</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
          </Section>
        </>
      )}
    </PageShell>
  );
}

function Section({ title, icon: Icon, note, children }: { title: string; icon: React.ComponentType<{ className?: string }>; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h2>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <Card className="hover-lift">
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
          {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
