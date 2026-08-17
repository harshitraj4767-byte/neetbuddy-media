import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Loader2, ShieldCheck, Tag, X, Share2, Scale, Info } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/razorpay.functions";
import { getMySubscription } from "@/lib/subscriptions.functions";
import { listActiveBatches, validateCoupon } from "@/lib/batches.functions";
import { FEATURE_LABEL_MAP } from "@/lib/feature-labels";
import { toast } from "sonner";

export const Route = createFileRoute("/premium")({
  head: () => ({ meta: [{ title: "Premium Batches — Neet Buddy" }] }),
  component: PremiumPage,
});

declare global { interface Window { Razorpay?: any } }
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

type Batch = {
  id: string; title: string; image_url: string | null;
  price: number; discounted_price: number; duration_days: number;
  features: Record<string, boolean>; ai_description: string | null; short_tagline: string | null;
};

function PremiumPage() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [active, setActive] = useState<Batch | null>(null);
  const list = useServerFn(listActiveBatches);
  const getSub = useServerFn(getMySubscription);

  useEffect(() => {
    list().then((r: any) => setBatches(r)).catch((e) => toast.error(e.message));
    if (user) getSub().then((r) => { setIsPremium(r.isPremium); setExpiresAt(r.subscription?.expires_at ?? null); }).catch(() => {});
  }, [user]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-lg">
            <Crown className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Premium Batches</h1>
            <p className="text-sm text-muted-foreground">Unlock the full Neet Buddy experience.</p>
          </div>
        </div>

        {isPremium && (
          <Card className="mb-6 border-emerald-500/40 bg-emerald-500/5">
            <CardContent className="flex items-center gap-3 p-4 text-sm">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <div>You have an active premium plan{expiresAt ? ` — valid till ${new Date(expiresAt).toLocaleDateString()}` : ""}.</div>
            </CardContent>
          </Card>
        )}

        {batches === null ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : batches.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No batches yet. Check back soon.</CardContent></Card>
        ) : (
          <>
          {batches.length >= 2 && (
            <div className="mb-4 flex items-center justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to="/batches/compare"><Scale className="mr-1 h-4 w-4" /> Compare Batches</Link>
              </Button>
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((b) => {
              const offPct = b.price > 0 ? Math.round(((b.price - b.discounted_price) / b.price) * 100) : 0;
              const featureCount = Object.values(b.features ?? {}).filter(Boolean).length;
              return (
                <Card key={b.id} className="overflow-hidden transition hover:shadow-xl">
                  {b.image_url ? (
                    <div className="w-full overflow-hidden bg-muted/30 aspect-video">
                      <img src={b.image_url} alt={b.title} className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-full aspect-video bg-gradient-to-br from-primary/30 to-amber-500/30" />
                  )}
                  <CardContent className="space-y-3 p-5">
                    <div>
                      <h3 className="text-lg font-bold">{b.title}</h3>
                      {b.short_tagline && <p className="text-xs text-muted-foreground">{b.short_tagline}</p>}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">₹{b.discounted_price}</span>
                      {offPct > 0 && (
                        <>
                          <span className="text-sm text-muted-foreground line-through">₹{b.price}</span>
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">{offPct}% off</Badge>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{b.duration_days} days access</div>
                    {featureCount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {featureCount} premium feature{featureCount === 1 ? "" : "s"} included
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button className="flex-1" onClick={() => { if (!user) { nav({ to: "/login" }); return; } setActive(b); }}>
                        Buy Batch
                      </Button>
                      <Button asChild variant="outline" className="flex-1">
                        <Link to="/batches/$batchId" params={{ batchId: b.id }}>
                          <Info className="mr-1 h-4 w-4" /> Batch Details
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Share batch"
                        onClick={async () => {
                          const url = `${window.location.origin}/batches/${b.id}`;
                          try {
                            if ((navigator as any).share) {
                              await (navigator as any).share({ title: b.title, text: b.short_tagline ?? "", url });
                            } else {
                              await navigator.clipboard.writeText(url);
                              toast.success("Link copied");
                            }
                          } catch {}
                        }}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          </>
        )}
      </main>

      {active && <OrderSummary batch={active} onClose={() => setActive(null)} userEmail={user?.email} userName={profile?.full_name} onSuccess={() => { setActive(null); getSub().then((r) => { setIsPremium(r.isPremium); setExpiresAt(r.subscription?.expires_at ?? null); }); }} />}
    </div>
  );
}

function OrderSummary({ batch, onClose, userEmail, userName, onSuccess }: { batch: Batch; onClose: () => void; userEmail?: string | null; userName?: string | null; onSuccess: () => void; }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<{ code: string; discount: number; final: number } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const validate = useServerFn(validateCoupon);
  const create = useServerFn(createRazorpayOrder);
  const verify = useServerFn(verifyRazorpayPayment);

  const base = Number(batch.discounted_price);
  const total = applied ? applied.final : base;
  const totalDiscount = Number(batch.price) - total;

  async function apply() {
    if (!code.trim()) return;
    setVerifying(true);
    try {
      const r = await validate({ data: { code: code.trim(), batch_id: batch.id } });
      setApplied({ code: r.code, discount: r.discount_amount, final: r.final_amount });
      toast.success(`Coupon applied! Saved ₹${r.discount_amount.toFixed(2)}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setVerifying(false); }
  }

  async function pay() {
    setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Could not load Razorpay");
      const order = await create({ data: { amount: total, purpose: "batch" as any, batch_id: batch.id, coupon_code: applied?.code } as any });
      await new Promise<void>((resolve) => {
        const rzp = new window.Razorpay({
          key: order.keyId, amount: order.amount, currency: order.currency,
          name: "Neet Buddy", description: batch.title, order_id: order.orderId,
          prefill: { name: userName ?? "", email: userEmail ?? "" },
          theme: { color: "#0ea5e9" },
          handler: async (resp: any) => {
            try {
              await verify({ data: {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              } as any });
              toast.success("Premium activated!");
              onSuccess();
            } catch (e: any) { toast.error(e.message); }
            finally { resolve(); }
          },
          modal: { ondismiss: () => resolve() },
        });
        rzp.open();
      });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Order Summary</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {batch.image_url && (
            <div className="w-full overflow-hidden rounded-lg bg-muted/30 aspect-video">
              <img src={batch.image_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div>
            <div className="font-semibold">{batch.title}</div>
            <div className="text-xs text-muted-foreground">{batch.duration_days} days premium access</div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Coupon code</label>
            {applied ? (
              <div className="flex items-center justify-between rounded bg-emerald-500/10 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 font-semibold text-emerald-700"><Tag className="h-4 w-4" /> {applied.code}</span>
                <button onClick={() => { setApplied(null); setCode(""); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ENTER CODE" />
                <Button variant="secondary" onClick={apply} disabled={verifying || !code.trim()}>{verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}</Button>
              </div>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <Row label="MRP" value={`₹${Number(batch.price).toFixed(2)}`} strike />
            <Row label="Batch discount" value={`− ₹${(Number(batch.price) - base).toFixed(2)}`} positive />
            {applied && <Row label="Coupon discount" value={`− ₹${applied.discount.toFixed(2)}`} positive />}
            <div className="my-2 border-t" />
            <Row label="You save" value={`₹${totalDiscount.toFixed(2)}`} positive bold />
            <Row label="Total payable" value={`₹${total.toFixed(2)}`} bold />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={pay} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ₹${total.toFixed(2)}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strike, positive, bold }: { label: string; value: string; strike?: boolean; positive?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={[bold ? "font-bold" : "", strike ? "line-through text-muted-foreground" : "", positive ? "text-emerald-600" : ""].join(" ")}>{value}</span>
    </div>
  );
}
