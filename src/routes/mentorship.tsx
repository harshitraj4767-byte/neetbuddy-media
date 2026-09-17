import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  GraduationCap, MessageCircle, Check, Sparkles, Trophy, ArrowRight,
  Star, ShieldCheck, Users, Clock, Loader2, Tag, X,
} from "lucide-react";
import { mediaAsset } from "@/lib/media-assets";

const akmalImage = mediaAsset("src/assets/akmal.jpg");
import { listFeaturedSelections } from "@/lib/selections.functions";
import {
  previewMentorshipCoupon,
  createMentorshipOrder,
  verifyMentorshipPayment,
} from "@/lib/mentorship-purchase.functions";

export const Route = createFileRoute("/mentorship")({
  head: () => ({
    meta: [
      { title: "Mentorship Program — Neet Buddy" },
      { name: "description", content: "1-on-1 WhatsApp mentorship with Mohd Akmal. Daily doubt support, personal study plan, motivation and analytics reviews. Plans from ₹1,999." },
      { property: "og:title", content: "Neet Buddy Mentorship Program" },
      { property: "og:description", content: "1-on-1 WhatsApp mentorship with Mohd Akmal. All Prime features + personal mentor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MentorshipPurchasePage,
});

// WhatsApp redirect number for payment confirmation.
const WHATSAPP_NUMBER = "919720317761";

type PlanKey = "1m" | "6m" | "neet";
const PLANS: { key: PlanKey; label: string; price: number; duration: string; tag: string; highlight?: boolean }[] = [
  { key: "1m", label: "1 Month", price: 1999, duration: "30 days access", tag: "Try it out" },
  { key: "6m", label: "6 Months", price: 5499, duration: "180 days access", tag: "Most popular", highlight: true },
  { key: "neet", label: "Till NEET 2026", price: 8999, duration: "Valid till NEET 2026", tag: "Best value" },
];

const MENTOR_FEATURES = [
  "Everything in the Prime batch",
  "1-on-1 WhatsApp mentorship (chat + calls)",
  "Personalised weekly study plan",
  "Daily doubt solving & concept clarity",
  "Test-paper analysis & weak-area drills",
  "Motivation, exam strategy & routine coaching",
  "Priority support from a real NEET mentor",
];

const AKMAL = {
  name: "Mohd Akmal",
  title: "3rd Year MBBS · NEET Mentor",
  bio: "3rd Year MBBS student and a dedicated NEET mentor with years of experience guiding medical aspirants. His inspiring journey — from scoring 30 marks to 655 marks in just 9 months — reflects the power of determination, smart strategy, and consistent effort.",
  mission: "To inspire and mentor future doctors by providing practical guidance, motivation, and a clear roadmap to crack NEET.",
  quote: "The only impossible journey is the one you never begin.",
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function whatsappRedirect(
  plan: typeof PLANS[number],
  paymentId: string | null,
  orderId: string | null,
  purchased: boolean,
  amountPaid?: number,
  couponCode?: string | null,
  discount?: number,
) {
  const now = new Date();
  const when = now.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const paid = amountPaid ?? plan.price;
  const lines = purchased
    ? [
        "Hi Neet Buddy team,",
        "",
        `I have purchased the Mentorship Program — ${plan.label} plan.`,
        `Amount paid: ₹${paid.toLocaleString("en-IN")}`,
        couponCode ? `Coupon: ${couponCode} (saved ₹${(discount ?? 0).toLocaleString("en-IN")})` : "",
        `Access: ${plan.duration}`,
        `Payment time: ${when}`,
        orderId ? `Order ID: ${orderId}` : "",
        paymentId ? `Payment ID: ${paymentId}` : "",
        "",
        "Please activate my mentorship and share the next steps.",
      ]
    : [
        "Hi Neet Buddy team,",
        "",
        `I want to know about the Mentorship Program — ${plan.label} plan (₹${plan.price.toLocaleString("en-IN")}).`,
        "Could you share the details and help me get started?",
      ];
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    lines.filter(Boolean).join("\n"),
  )}`;
  window.open(url, "_blank", "noopener");
}

function MentorshipPurchasePage() {
  const [selected, setSelected] = useState<PlanKey>("6m");
  const [busy, setBusy] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; finalAmount: number; discount: number; coupon_id: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const previewFn = useServerFn(previewMentorshipCoupon);
  const createOrder = useServerFn(createMentorshipOrder);
  const verifyPayment = useServerFn(verifyMentorshipPayment);
  const plan = PLANS.find((p) => p.key === selected)!;
  const payable = applied?.finalAmount ?? plan.price;

  // Reset any applied coupon when the plan changes — pricing rules may differ.
  useEffect(() => { setApplied(null); }, [selected]);

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setChecking(true);
    try {
      const res: any = await previewFn({ data: { plan: selected, coupon_code: couponCode.trim() } });
      setApplied({ code: res.code ?? couponCode.trim().toUpperCase(), finalAmount: res.finalAmount, discount: res.discount, coupon_id: res.coupon_id });
      toast.success(`Coupon applied — you save ₹${res.discount.toLocaleString("en-IN")}`);
    } catch (e: any) {
      setApplied(null);
      toast.error(e?.message ?? "Invalid coupon");
    } finally { setChecking(false); }
  }

  async function payAndRedirect() {
    setBusy(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) throw new Error("Could not load Razorpay checkout. Check your connection.");

      const order: any = await createOrder({ data: {
        plan: selected,
        coupon_code: applied ? applied.code : null,
      } });

      const rzp = new window.Razorpay!({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "Neet Buddy Mentorship",
        description: `${plan.label} plan`,
        theme: { color: "#f97316" },
        prefill: {},
        notes: { plan: plan.label, program: "mentorship" },
        handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await verifyPayment({ data: {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              plan: selected,
              coupon_id: applied?.coupon_id ?? null,
            } });
            toast.success("Mentorship activated — opening WhatsApp");
          } catch (e: any) {
            toast.error(e?.message ?? "Verification failed — WhatsApp will still open");
          }
          whatsappRedirect(plan, resp.razorpay_payment_id, resp.razorpay_order_id, true, order.finalAmount, applied?.code ?? null, applied?.discount ?? 0);
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e?.message ?? "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  function whatsappOnly() {
    whatsappRedirect(plan, null, null, false);
  }

  return (
    <PageShell
      eyebrow="Program"
      title="1-on-1 NEET Mentorship"
      description="A personal NEET mentor on WhatsApp. Daily doubts, planning, motivation — all handled by Mohd Akmal."
    >
      <div className="space-y-8">
        {/* 1. MENTOR — shown first */}
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Meet your mentor</div>
          <Card className="mt-3 overflow-hidden border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent">
            <CardContent className="grid grid-cols-[auto_1fr] items-start gap-4 p-4 sm:gap-6 sm:p-6">
              <img
                src={akmalImage}
                alt={AKMAL.name}
                className="h-24 w-24 rounded-2xl border-4 border-background object-cover shadow-lg sm:h-40 sm:w-40"
              />
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 sm:text-xs">
                  <Sparkles className="h-3 w-3" /> Your NEET Mentor
                </div>
                <h2 className="mt-1.5 text-xl font-bold leading-tight sm:text-3xl">{AKMAL.name}</h2>
                <div className="text-xs text-muted-foreground sm:text-sm">{AKMAL.title}</div>
                <div className="mt-1 flex items-center gap-0.5 text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />)}
                </div>
              </div>
              <div className="col-span-2 min-w-0">
                <p className="text-sm text-foreground/90">{AKMAL.bio}</p>
                <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-primary">Mission</div>
                  <p className="mt-1 text-sm text-foreground/90">{AKMAL.mission}</p>
                </div>
                <blockquote className="mt-3 border-l-4 border-amber-500 pl-3 text-sm italic text-foreground/90">
                  “{AKMAL.quote}”
                </blockquote>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Verified mentor</span>
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-primary" /> Same-day replies</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-amber-500" /> 1-on-1, never groups</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 2. SELECTIONS (admin-managed) */}
        <MentorshipSelections />

        {/* 3. WHAT'S INCLUDED */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <div className="text-lg font-bold">What's included</div>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {MENTOR_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 4. PAYMENT — combined plan selector at the bottom */}
        <div id="pricing">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Choose your plan &amp; pay</div>
          <Card className="mt-3 border-primary/40">
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {PLANS.map((p) => {
                  const isSel = p.key === selected;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSelected(p.key)}
                      className={`relative rounded-xl border p-4 text-left transition-all ${
                        isSel
                          ? "border-primary bg-primary/5 shadow-elegant"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      {p.highlight && (
                        <Badge className="absolute -top-2 right-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                          {p.tag}
                        </Badge>
                      )}
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {p.label}
                      </div>
                      <div className="mt-1 text-2xl font-bold">₹{p.price.toLocaleString("en-IN")}</div>
                      <div className="text-[11px] text-muted-foreground">{p.duration}</div>
                      {isSel && (
                        <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <Check className="h-3.5 w-3.5" /> Selected
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Coupon */}
              <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
                  <Tag className="h-3.5 w-3.5" /> Coupon code
                </div>
                {applied ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
                    <div>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{applied.code}</span>
                      <span className="ml-2 text-xs text-muted-foreground">You save ₹{applied.discount.toLocaleString("en-IN")}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setApplied(null); setCouponCode(""); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Enter code" className="h-9" />
                    <Button size="sm" variant="secondary" onClick={applyCoupon} disabled={checking || !couponCode.trim()}>
                      {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">You pay</div>
                  <div className="text-3xl font-bold">
                    ₹{payable.toLocaleString("en-IN")}
                    {applied && (
                      <span className="ml-2 align-middle text-base font-medium text-muted-foreground line-through">₹{plan.price.toLocaleString("en-IN")}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{plan.label} · {plan.duration}</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={payAndRedirect}
                    disabled={busy}
                    size="lg"
                    className="bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:brightness-110"
                  >
                    {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Pay ₹{payable.toLocaleString("en-IN")} with Razorpay
                  </Button>
                  <Button variant="outline" onClick={whatsappOnly}>
                    <MessageCircle className="mr-1 h-4 w-4" /> Ask on WhatsApp
                  </Button>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Secure payments by Razorpay. After payment, you'll be redirected to WhatsApp
                (+91 97203 17761) with your payment and plan details so we can activate your mentorship the same day.
              </p>
            </CardContent>
          </Card>
          <div className="mt-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/about">Read the full founder story <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function MentorshipSelections() {
  const list = useServerFn(listFeaturedSelections);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { list().then((r: any) => setRows(r ?? [])).catch(() => setRows([])); }, [list]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent selections</div>
      </div>

      {rows === null ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="overflow-hidden">
              <div className="aspect-video w-full animate-pulse bg-muted" />
              <CardContent className="p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="mt-3 border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Trophy className="h-8 w-8 text-amber-500/70" />
            <div className="font-semibold">Selection stories coming soon</div>
            <p className="max-w-md text-sm text-muted-foreground">
              We'll showcase real Neet Buddy mentorship students here as new selections come in.
              Admins can add stories and images from the Admin panel → Selections.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, 6).map((s) => {
            const cover = s.media?.find((m: any) => m.type === "image") ?? s.media?.[0];
            return (
              <Card key={s.id} className="overflow-hidden">
                {cover && (
                  cover.type === "image"
                    ? <img src={cover.url} alt={s.student_name} className="aspect-video w-full object-cover" />
                    : <video src={cover.url} className="aspect-video w-full object-cover" muted playsInline controls />
                )}
                <CardContent className="p-4">
                  <div className="font-bold">{s.student_name}</div>
                  <div className="text-xs text-muted-foreground">{[s.rank_text, s.college, s.exam_year].filter(Boolean).join(" · ")}</div>
                  {s.story && <p className="mt-2 line-clamp-3 text-xs text-foreground/80">{s.story}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
