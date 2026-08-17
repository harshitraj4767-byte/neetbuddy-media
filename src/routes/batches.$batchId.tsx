import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Loader2, Share2, Sparkles, Target, Clock, MessageCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listActiveBatches } from "@/lib/batches.functions";
import { FEATURE_LABEL_MAP } from "@/lib/feature-labels";

export const Route = createFileRoute("/batches/$batchId")({
  head: ({ params }) => ({
    meta: [
      { title: `Batch — Neet Buddy` },
      { name: "description", content: "View this Neet Buddy batch with full feature list and pricing." },
      { property: "og:title", content: `Neet Buddy Batch` },
      { property: "og:description", content: "AI-powered NEET preparation — see what this batch includes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: typeof window !== "undefined" ? window.location.href : `/batches/${params.batchId}` },
    ],
  }),
  component: BatchSharePage,
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

function BatchSharePage() {
  const { batchId } = Route.useParams();
  const list = useServerFn(listActiveBatches);
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);

  useEffect(() => {
    list()
      .then((r: any) => {
        const found = (r as Batch[]).find((b) => b.id === batchId) ?? null;
        setBatch(found);
      })
      .catch(() => setBatch(null));
  }, [batchId]);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: `${batch?.title ?? "Neet Buddy Batch"}`,
          text: batch?.short_tagline ?? "Check this Neet Buddy batch.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/premium">
            <ArrowLeft className="mr-1 h-4 w-4" /> All batches
          </Link>
        </Button>

        {batch === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !batch ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Batch not found or no longer active.
            </CardContent>
          </Card>
        ) : (
          <BatchBody batch={batch} share={share} />
        )}
      </main>
    </div>
  );
}

function BatchBody({ batch, share }: { batch: Batch; share: () => Promise<void> }) {
  const isElite = useMemo(() => /elite/i.test(batch.title), [batch.title]);
  return (
          <Card className="overflow-hidden">
            {batch.image_url && (
              <div className="w-full overflow-hidden bg-muted/30 aspect-video">
                <img src={batch.image_url} alt={batch.title} className="h-full w-full object-cover" />
              </div>
            )}
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold">{batch.title}</h1>
                  {batch.short_tagline && (
                    <p className="text-sm text-muted-foreground">{batch.short_tagline}</p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 className="mr-1 h-4 w-4" /> Share
                </Button>
              </div>
              {!isElite && <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold">₹{batch.discounted_price}</span>
                <span className="text-sm text-muted-foreground line-through">₹{batch.price}</span>
                <Badge variant="secondary">{batch.duration_days} days</Badge>
              </div>}
              {batch.ai_description && (
                <p className="whitespace-pre-line text-sm text-foreground/90">{batch.ai_description}</p>
              )}
              <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-amber-500/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Target className="h-3.5 w-3.5" /> Who this batch is for
                </div>
                <ul className="space-y-1.5 text-sm text-foreground/90">
                  <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> NEET aspirants who want structured, AI-powered daily practice.</li>
                  <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> Students preparing across Physics, Chemistry &amp; Biology with mixed strengths.</li>
                  <li className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> Learners who can commit to {Math.max(1, Math.round(batch.duration_days / 30))} month{batch.duration_days >= 60 ? "s" : ""} of consistent prep.</li>
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> Anyone who wants unlimited access to mocks, PYQs and analytics without ads.</li>
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">What's included</div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(batch.features ?? {})
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <li key={k} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {FEATURE_LABEL_MAP[k] ?? k}
                      </li>
                    ))}
                </ul>
              </div>
              {isElite ? (
                <ElitePlans title={batch.title} />
              ) : (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild className="flex-1">
                  <Link to="/premium">
                    Buy Now <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/batches/compare">Compare all</Link>
                </Button>
              </div>
              )}
            </CardContent>
          </Card>
  );
}

const WHATSAPP_NUMBER = "917302871829";
const ELITE_PLANS = [
  { key: "1m", label: "1 Month", price: 1999, duration: "30 days" },
  { key: "6m", label: "6 Months", price: 9999, duration: "180 days", badge: "Best value" },
  { key: "12m", label: "12 Months", price: 17999, duration: "365 days", badge: "Till NEET" },
];

function ElitePlans({ title }: { title: string }) {
  function buy(plan: typeof ELITE_PLANS[number]) {
    const text = encodeURIComponent(
      `Hi Neet Buddy team,\n\nI want to purchase the ${title} — ${plan.label} plan (₹${plan.price} / ${plan.duration}).\n\nPlease share the payment details.`,
    );
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    window.open(url, "_blank", "noopener");
  }
  return (
    <div className="space-y-3 pt-2">
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Choose your Elite plan</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ELITE_PLANS.map((p) => (
          <div key={p.key} className="relative rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-4">
            {p.badge && <Badge className="absolute -top-2 right-3 bg-amber-500 text-white">{p.badge}</Badge>}
            <div className="text-sm font-bold">{p.label}</div>
            <div className="mt-1 text-2xl font-bold">₹{p.price.toLocaleString("en-IN")}</div>
            <div className="text-xs text-muted-foreground">{p.duration}</div>
            <Button onClick={() => buy(p)} className="mt-3 w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
              <MessageCircle className="mr-1 h-4 w-4" /> Buy on WhatsApp
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Purchase happens over WhatsApp with our business account (+91 7302871829). Send us your details and we'll activate your access.
      </p>
    </div>
  );
}
