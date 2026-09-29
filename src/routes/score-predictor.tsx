import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Target, Sparkles, TrendingUp, AlertTriangle, Lightbulb, Trophy, BookOpen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/score-predictor")({
  head: () => ({ meta: [{ title: "Score Predictor — Neet Buddy" }] }),
  component: ScorePredictorPage,
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

  const [latest, setLatest] = useState<Prediction | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [noAttempts, setNoAttempts] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/score_predictor.php", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.latest) {
          setLatest(d.latest);
        } else {
          setLatest(null);
        }
      })
      .catch(() => setLatest(null));
  }, [user?.id]);

  // 48-hour cooldown derived from latest.created_at
  const COOLDOWN_MS = 48 * 60 * 60 * 1000;
  const nextEligibleAt = latest ? new Date(new Date(latest.created_at).getTime() + COOLDOWN_MS) : null;
  const locked = !!(nextEligibleAt && nextEligibleAt.getTime() > Date.now());

  async function onRun() {
    if (locked) {
      toast.error(`Score predictor is available once every 48 hours. Next run eligible on ${nextEligibleAt!.toLocaleString()}.`);
      return;
    }
    setBusy(true);
    setNoAttempts(false);
    try {
      const res = await fetch("/api/score_predictor.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error && data.error.includes("at least one")) {
          setNoAttempts(true);
        }
        throw new Error(data.error || "Prediction failed");
      }
      setLatest(data.prediction);
      toast.success(`Predicted: ${data.prediction.predicted_marks} / 720`);
    } catch (e: any) {
      toast.error(e?.message ?? "Prediction failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || latest === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Insights"
      title="NEET Score Predictor"
      description="Real test performance forecast based on your subject accuracy and negative marking habits."
    >
      <Card className="mb-4 border-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-elegant">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur shadow-sm">
              <Target className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-100">Predicted NEET Score</div>
              {latest ? (
                <>
                  <div className="text-3xl sm:text-4xl font-extrabold mt-0.5">
                    {latest.predicted_marks} <span className="text-base sm:text-lg font-medium opacity-80">/ 720</span>
                  </div>
                  <div className="text-xs text-emerald-100 mt-1">
                    Expected AIR: <strong>{latest.predicted_air_band}</strong> · Updated {new Date(latest.created_at).toLocaleDateString()}
                  </div>
                </>
              ) : (
                <div className="text-sm text-emerald-50 mt-1">
                  Ready to calculate your projected NEET marks from your practice sessions.
                </div>
              )}
            </div>
          </div>

          {noAttempts && (
            <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-500/20 p-3 text-xs text-amber-100">
              You haven't completed any test sessions yet. Complete at least one Daily DPP or Mock Test so we can analyze your question accuracy!
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <Button
              onClick={onRun}
              disabled={busy || locked}
              variant="secondary"
              className="w-full sm:w-auto bg-white text-emerald-800 hover:bg-white/90 font-bold shadow"
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {locked
                ? `Available on ${nextEligibleAt!.toLocaleDateString()} (${nextEligibleAt!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`
                : latest
                ? "Recalculate Prediction"
                : "Predict My Score Now"}
            </Button>
            {noAttempts && (
              <Button asChild variant="outline" className="w-full sm:w-auto border-white/40 bg-white/10 hover:bg-white/20 text-white">
                <Link to="/dpp">
                  <BookOpen className="mr-1.5 h-4 w-4" /> Start Daily DPP
                </Link>
              </Button>
            )}
          </div>

          {locked && (
            <div className="mt-2 text-center sm:text-left text-[11px] text-emerald-100/90">
              Predictions refresh every 48 hours to give your practice time to reflect in accuracy trends.
            </div>
          )}
        </CardContent>
      </Card>

      {latest && (
        <div className="space-y-4">
          {latest.payload.subject_breakdown && latest.payload.subject_breakdown.length > 0 && (
            <Section icon={Trophy} title="Subject-wise Forecast" tint="from-sky-50 to-blue-50 dark:from-sky-950/20 dark:to-blue-950/10">
              <div className="space-y-3">
                {latest.payload.subject_breakdown.map((s) => {
                  const pct = s.max_marks ? Math.round((s.predicted_marks / s.max_marks) * 100) : 0;
                  return (
                    <div key={s.subject}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold">{s.subject}</span>
                        <span className="font-bold text-foreground">
                          {s.predicted_marks} <span className="text-xs font-normal text-muted-foreground">/ {s.max_marks} marks ({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {latest.payload.strengths && latest.payload.strengths.length > 0 && (
            <Section icon={TrendingUp} title="Identified Strengths" tint="from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10">
              <ul className="space-y-2 text-xs sm:text-sm">
                {latest.payload.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {latest.payload.weaknesses && latest.payload.weaknesses.length > 0 && (
            <Section icon={AlertTriangle} title="Priority Improvement Areas" tint="from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/10">
              <ul className="space-y-2 text-xs sm:text-sm">
                {latest.payload.weaknesses.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold text-xs">!</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {latest.payload.advice && latest.payload.advice.length > 0 && (
            <Section icon={Lightbulb} title="Coach's Strategy Recommendations" tint="from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10">
              <ul className="space-y-2 text-xs sm:text-sm">
                {latest.payload.advice.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </PageShell>
  );
}

function Section({ icon: Icon, title, tint, children }: { icon: any; title: string; tint: string; children: React.ReactNode }) {
  return (
    <Card className={`border border-border/50 bg-gradient-to-br ${tint} shadow-sm`}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
