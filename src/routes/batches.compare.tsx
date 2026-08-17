import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Loader2, Sparkles, ArrowLeft, Share2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listActiveBatches, compareBatchesAi } from "@/lib/batches.functions";
import { FEATURE_LABEL_MAP } from "@/lib/feature-labels";

export const Route = createFileRoute("/batches/compare")({
  head: () => ({
    meta: [
      { title: "Compare Batches — Neet Buddy" },
      { name: "description", content: "Compare Essential, Prime and Elite side-by-side and get an AI deep-compare tailored to your NEET goals." },
      { property: "og:title", content: "Compare Batches — Neet Buddy" },
      { property: "og:description", content: "Find the batch that fits your goals with a side-by-side feature matrix plus AI deep compare." },
    ],
  }),
  component: ComparePage,
});

type Batch = {
  id: string;
  title: string;
  image_url: string | null;
  price: number;
  discounted_price: number;
  duration_days: number;
  features: Record<string, boolean>;
  short_tagline: string | null;
  ai_description: string | null;
};

function ComparePage() {
  const list = useServerFn(listActiveBatches);
  const compare = useServerFn(compareBatchesAi);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<any>(null);

  useEffect(() => {
    list()
      .then((r: any) => setBatches(r as Batch[]))
      .catch((e: any) => toast.error(e.message));
  }, []);

  const featureKeys = batches
    ? Array.from(new Set(batches.flatMap((b) => Object.keys(b.features ?? {}))))
    : [];

  async function runAi() {
    if (!batches || batches.length < 2) return;
    setBusy(true);
    setAi(null);
    try {
      const r = await compare({
        data: {
          batch_ids: batches.map((b) => b.id),
          goal,
          budget,
          include_images: true,
        },
      });
      setAi(r);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/premium">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to Batches
              </Link>
            </Button>
            <h1 className="text-2xl font-bold sm:text-3xl">Compare Batches</h1>
            <p className="text-sm text-muted-foreground">Side-by-side feature matrix plus an AI deep compare tailored to your goals.</p>
          </div>
        </div>

        {!batches ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : batches.length < 2 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Need at least 2 active batches to compare.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header row */}
            <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="w-[220px] p-4 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                    {batches.map((b) => (
                      <th key={b.id} className="p-4 text-left align-top">
                        <div className="space-y-2">
                          {b.image_url && (
                            <div className="w-full overflow-hidden rounded-lg bg-muted/30 aspect-video">
                              <img src={b.image_url} alt="" className="h-full w-full object-cover" />
                            </div>
                          )}
                          <div className="text-base font-bold leading-tight text-foreground">{b.title}</div>
                          {b.short_tagline && (
                            <div className="text-xs text-muted-foreground">{b.short_tagline}</div>
                          )}
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-bold">₹{b.discounted_price}</span>
                            <span className="text-xs text-muted-foreground line-through">₹{b.price}</span>
                          </div>
                          <ShareBatchButton batch={b} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3 text-xs font-medium text-muted-foreground">Duration</td>
                    {batches.map((b) => (
                      <td key={b.id} className="p-3 text-sm">{b.duration_days} days</td>
                    ))}
                  </tr>
                  {featureKeys.map((k) => (
                    <tr key={k} className="border-b border-border/60 last:border-0">
                      <td className="p-3 text-sm font-medium text-foreground">{FEATURE_LABEL_MAP[k] ?? k}</td>
                      {batches.map((b) => (
                        <td key={b.id} className="p-3">
                          {b.features?.[k] ? (
                            <Check className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <X className="h-5 w-5 text-muted-foreground/40" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI Deep Compare */}
            <Card className="mt-6 border-primary/30 bg-gradient-to-br from-primary/5 to-card">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 p-2 text-white shadow">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">AI Deep Compare</h2>
                    <p className="text-xs text-muted-foreground">
                      Get a personalized recommendation based on your goal, budget, and the batch artwork itself.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Your NEET goal</label>
                    <Textarea
                      rows={2}
                      placeholder="e.g. 650+ in NEET 2026, weak in Physics, comfortable with Biology"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Budget (optional)</label>
                    <Input
                      placeholder="e.g. up to ₹2000/year"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={runAi} disabled={busy} className="w-full sm:w-auto">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Deep Compare with AI
                </Button>

                {ai?.result && (
                  <div className="rounded-xl border border-border bg-background/60 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant="secondary">Recommendation</Badge>
                      <div className="text-base font-semibold">{ai.result.headline ?? "AI Result"}</div>
                    </div>
                    {ai.result.reasoning && (
                      <p className="text-sm text-muted-foreground">{ai.result.reasoning}</p>
                    )}
                    {Array.isArray(ai.result.per_batch) && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {ai.result.per_batch.map((p: any) => {
                          const b = batches.find((x) => x.id === p.batch_id);
                          if (!b) return null;
                          const rec = ai.result.recommended_batch_id === p.batch_id;
                          return (
                            <div
                              key={p.batch_id}
                              className={`rounded-xl border p-3 ${rec ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-card"}`}
                            >
                              <div className="mb-1 flex items-center justify-between">
                                <div className="font-semibold">{b.title}</div>
                                {rec && <Badge className="bg-emerald-500 text-white">Best fit</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">Fit score: {p.fit_score ?? "—"}/100</div>
                              {Array.isArray(p.strengths) && p.strengths.length > 0 && (
                                <div className="mt-2 text-xs">
                                  <div className="font-medium text-foreground">Strengths</div>
                                  <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                                    {p.strengths.slice(0, 4).map((s: string, i: number) => (
                                      <li key={i}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {Array.isArray(p.gaps) && p.gaps.length > 0 && (
                                <div className="mt-2 text-xs">
                                  <div className="font-medium text-foreground">Gaps</div>
                                  <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                                    {p.gaps.slice(0, 3).map((s: string, i: number) => (
                                      <li key={i}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function ShareBatchButton({ batch }: { batch: Batch }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      onClick={async () => {
        const slug = encodeURIComponent(batch.id);
        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/batches/${slug}`;
        const shareData = {
          title: `${batch.title} — Neet Buddy`,
          text: batch.short_tagline ?? `Check out the ${batch.title} batch on Neet Buddy.`,
          url,
        };
        try {
          if (typeof navigator !== "undefined" && (navigator as any).share) {
            await (navigator as any).share(shareData);
          } else {
            await navigator.clipboard.writeText(url);
            toast.success("Share link copied to clipboard");
          }
        } catch {
          // user cancelled
        }
      }}
    >
      <Share2 className="mr-1 h-4 w-4" /> Share
    </Button>
  );
}
