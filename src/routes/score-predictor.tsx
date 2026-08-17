import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Target, Sparkles, TrendingUp, AlertTriangle, Lightbulb, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getLatestPrediction, runScorePrediction } from "@/lib/score-predictor.functions";
import { getAppSettings } from "@/lib/app-settings.functions";
import { toast } from "sonner";
import { FeatureLock } from "@/components/feature-lock";

export const Route = createFileRoute("/score-predictor")({
  head: () => ({ meta: [{ title: "Score Predictor — Neet Buddy" }] }),
  component: () => (<FeatureLock feature="score_predictor"><ScorePredictorPage /></FeatureLock>),
});

type Prediction = {
  id: string;
  predicted_marks: number;
  predicted_air_band: string;
  payload: {
    subject_breakdown?: { subject: string; predicted_marks: number; max_marks: number }[];
    strengths?: string[];
    weaknesses?: string[];
    advice?: string[];
  };
  created_at: string;
};

function ScorePredictorPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fetchLatest = useServerFn(getLatestPrediction);
  const run = useServerFn(runScorePrediction);
  const settings = useServerFn(getAppSettings);

  const [latest, setLatest] = useState<Prediction | null | undefined>(undefined);
  const [cost, setCost] = useState(25);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => {
    if (!user) return;
    fetchLatest().then((r) => setLatest((r.latest as Prediction | null) ?? null)).catch(() => setLatest(null));
    settings().then((s) => setCost(s.score_predictor_cost));
  }, [user?.id]);

  // 48-hour cooldown, derived from latest.created_at
  const COOLDOWN_MS = 48 * 60 * 60 * 1000;
  const nextEligibleAt = latest ? new Date(new Date(latest.created_at).getTime() + COOLDOWN_MS) : null;
  const locked = !!(nextEligibleAt && nextEligibleAt.getTime() > Date.now());

  async function onRun() {
    if (locked) {
      toast.error(`Score predictor is available once every 48 hours. Come back on ${nextEligibleAt!.toLocaleString()}.`);
      return;
    }
    if (!confirm(`Run a new score prediction?`)) return;
    setBusy(true);
    try {
      const r = await run({}) as { prediction: Prediction };
      setLatest(r.prediction);
      toast.success(`Predicted: ${r.prediction.predicted_marks} / 720`);
    } catch (e: any) {
      toast.error(e?.message ?? "Prediction failed");
    } finally { setBusy(false); }
  }

  if (loading || !user || latest === undefined) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <PageShell eyebrow="Insights" title="Score Predictor" description={`AI-powered NEET score forecast from your test history. Runs once every 48 hours.`}>
      <Card className="mb-4 border-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-elegant">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <Target className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest opacity-90">Predicted NEET Score</div>
              {latest ? (
                <>
                  <div className="text-3xl font-extrabold">{latest.predicted_marks} <span className="text-base font-medium opacity-80">/ 720</span></div>
                  <div className="text-xs opacity-90">AIR band: <strong>{latest.predicted_air_band}</strong> · {new Date(latest.created_at).toLocaleDateString()}</div>
                </>
              ) : (
                <div className="text-sm opacity-90">Run your first prediction to see your forecast.</div>
              )}
            </div>
          </div>
          <Button onClick={onRun} disabled={busy || locked} variant="secondary" className="mt-4 w-full bg-white text-emerald-700 hover:bg-white/90">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            {locked ? `Available on ${nextEligibleAt!.toLocaleDateString()} · ${nextEligibleAt!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : (latest ? `Re-predict` : `Predict my score`)}
          </Button>
          {locked && (
            <div className="mt-2 text-center text-[11px] opacity-90">
              Predictions are limited to once every 48 hours to keep results meaningful.
            </div>
          )}
        </CardContent>
      </Card>

      {latest && (
        <>
          {latest.payload.subject_breakdown && latest.payload.subject_breakdown.length > 0 && (
            <Section icon={Trophy} title="Subject breakdown" tint="from-sky-50 to-blue-50 dark:from-sky-500/10 dark:to-blue-500/10">
              <div className="space-y-2">
                {latest.payload.subject_breakdown.map((s) => {
                  const pct = s.max_marks ? Math.round((s.predicted_marks / s.max_marks) * 100) : 0;
                  return (
                    <div key={s.subject}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold">{s.subject}</span>
                        <span className="text-muted-foreground">{s.predicted_marks} / {s.max_marks}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
          {latest.payload.strengths && latest.payload.strengths.length > 0 && (
            <Section icon={TrendingUp} title="Strengths" tint="from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10">
              <ul className="space-y-1.5 text-sm">{latest.payload.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{s}</li>)}</ul>
            </Section>
          )}
          {latest.payload.weaknesses && latest.payload.weaknesses.length > 0 && (
            <Section icon={AlertTriangle} title="Focus areas" tint="from-rose-50 to-pink-50 dark:from-rose-500/10 dark:to-pink-500/10">
              <ul className="space-y-1.5 text-sm">{latest.payload.weaknesses.map((s, i) => <li key={i} className="flex gap-2"><span className="text-rose-600">!</span>{s}</li>)}</ul>
            </Section>
          )}
          {latest.payload.advice && latest.payload.advice.length > 0 && (
            <Section icon={Lightbulb} title="Coach's advice" tint="from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10">
              <ul className="space-y-1.5 text-sm">{latest.payload.advice.map((s, i) => <li key={i} className="flex gap-2"><span className="text-amber-600">→</span>{s}</li>)}</ul>
            </Section>
          )}
        </>
      )}
    </PageShell>
  );
}

function Section({ icon: Icon, title, tint, children }: { icon: any; title: string; tint: string; children: React.ReactNode }) {
  return (
    <Card className={`mt-3 border-0 bg-gradient-to-br ${tint} shadow-soft`}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Icon className="h-4 w-4 text-primary" /> {title}</div>
        {children}
      </CardContent>
    </Card>
  );
}
