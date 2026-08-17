import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Copy, Gift, Users, Sparkles, Crown, ArrowRight, Wallet, Landmark, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { applyReferralCode, getMyReferralInfo, generateReferralCode } from "@/lib/referrals.functions";
import { requestWithdrawal, listMyWithdrawals } from "@/lib/wallet.functions";

export const Route = createFileRoute("/referrals")({
  head: () => ({ meta: [{ title: "Refer & Earn — Neet Buddy" }] }),
  component: ReferralsPage,
});

const TIERS = [
  { level: 1, name: "Essential", user: 300, collab: 400, tone: "from-blue-500/20 to-cyan-500/10 border-blue-500/30", nextThreshold: 5 },
  { level: 2, name: "Prime",     user: 500, collab: 600, tone: "from-fuchsia-500/20 to-purple-500/10 border-fuchsia-500/30", nextThreshold: 15 },
  { level: 3, name: "Elite",     user: 700, collab: 1000, tone: "from-amber-500/20 to-orange-500/10 border-amber-500/30", nextThreshold: null as number | null },
] as Array<{ level: 1 | 2 | 3; name: string; user: number; collab: number; tone: string; nextThreshold: number | null }>;

function ReferralsPage() {
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const fetchInfo = useServerFn(getMyReferralInfo);
  const apply = useServerFn(applyReferralCode);
  const generate = useServerFn(generateReferralCode);
  const listWithdraws = useServerFn(listMyWithdrawals);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchInfo>> | null>(null);
  const [withdraws, setWithdraws] = useState<Awaited<ReturnType<typeof listWithdraws>>>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await generate();
      setInfo((prev) => (prev ? { ...prev, code: r.code } : prev));
      toast.success("Referral code ready!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate code");
    } finally { setGenerating(false); }
  };

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const reload = () => {
      fetchInfo().then((d) => { if (alive) setInfo(d); }).catch(() => {});
      listWithdraws().then((d) => { if (alive) setWithdraws(d); }).catch(() => {});
    };
    reload();
    const ch = supabase
      .channel(`referrals-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "referrals", filter: `referrer_id=eq.${user.id}` }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${user.id}` }, () => reload())
      .subscribe();
    const onFocus = () => reload();
    const onVis = () => { if (!document.hidden) reload(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const poll = setInterval(reload, 30_000);
    return () => {
      alive = false;
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(poll);
    };
  }, [user?.id, fetchInfo, listWithdraws]);

  const link = info?.code ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${info.code}` : "";
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!"); };

  const submit = async () => {
    setBusy(true);
    try {
      await apply({ data: { code } });
      toast.success("Referral code applied!");
      setCode("");
      await refresh();
      const fresh = await fetchInfo();
      setInfo(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  const currentTier = TIERS[(info?.tier ?? 1) - 1] ?? TIERS[0];
  const nextTier = info && info.tier < 3 ? TIERS[info.tier] ?? null : null;
  const totalReferrals = info?.invited.length ?? 0;
  const progress = nextTier && currentTier.nextThreshold ? Math.min(100, (totalReferrals / currentTier.nextThreshold) * 100) : 100;


  return (
    <PageShell eyebrow="Cashback" title="Refer & Earn" description="Share your code. Earn real cash when friends buy a Neet Buddy batch.">
      {/* Tier + Balance */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className={`bg-gradient-to-br ${currentTier.tone} md:col-span-2`}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your tier</div>
                <div className="mt-1 flex items-center gap-2 text-2xl font-black">
                  <Crown className="h-6 w-6 text-amber-500" /> Tier {currentTier.level} · {currentTier.name}
                  {info?.isCollaborator && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Collaborator</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Earning <span className="font-bold text-foreground">₹{info?.isCollaborator ? currentTier.collab : currentTier.user}</span> per referral
                </div>
              </div>
              {nextTier ? (
                <div className="text-right text-xs">
                  <div className="uppercase tracking-widest text-muted-foreground">Next</div>
                  <div className="font-bold">{nextTier.name}</div>
                </div>
              ) : (
                <div className="text-right text-xs font-bold uppercase text-amber-600">Max tier ⚡</div>
              )}
            </div>
            {nextTier && currentTier.nextThreshold ? (
              <div>
                <Progress value={progress} className="h-2" />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>{totalReferrals} referrals</span>
                  <span>{currentTier.nextThreshold - totalReferrals} more → {nextTier.name}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Wallet className="h-4 w-4" /> Available
            </div>
            <div className="text-3xl font-black text-emerald-600">₹{(info?.balance.available ?? 0).toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-muted-foreground">
              Earned ₹{(info?.balance.earned ?? 0).toLocaleString("en-IN")} · Paid ₹{(info?.balance.paidOut ?? 0).toLocaleString("en-IN")}
              {info && info.balance.pending > 0 ? <> · Pending ₹{info.balance.pending.toLocaleString("en-IN")}</> : null}
            </div>
            <WithdrawDialog available={info?.balance.available ?? 0} onDone={() => listWithdraws().then((d) => setWithdraws(d)).catch(() => {})} />
          </CardContent>
        </Card>
      </div>

      {/* Code cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Gift className="h-4 w-4 text-amber-600" /> Your referral code
            </div>
            {!info ? <Loader2 className="h-4 w-4 animate-spin" /> : !info.code ? (
              <>
                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
                  You don't have a referral code yet.
                </div>
                <Button onClick={handleGenerate} disabled={generating} className="w-full bg-gradient-primary">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1.5 h-4 w-4" /> Generate my code</>}
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                  <div className="text-3xl font-bold tracking-widest">{info.code}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => copy(info.code!)}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy code
                  </Button>
                  <Button className="flex-1 bg-gradient-primary" onClick={() => copy(link)}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy link
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Gift className="h-4 w-4 text-emerald-600" /> Got a code from a friend?
            </div>
            {info?.hasUsedCode ? (
              <div className="rounded-lg border bg-secondary/40 p-3 text-sm">You've already redeemed a referral code.</div>
            ) : (
              <>
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ENTER CODE" maxLength={20} />
                <Button onClick={submit} disabled={busy || code.length < 4} className="w-full">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply code"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payout tiers */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Cash payouts per successful referral</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map((t) => (
            <Card key={t.name} className={`bg-gradient-to-br ${t.tone} ${info?.tier === t.level ? "ring-2 ring-primary" : ""}`}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tier {t.level} · {t.name}</div>
                  {info?.tier === t.level && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">YOU</span>}
                </div>
                <div className="flex items-baseline gap-1"><span className="text-3xl font-black">₹{t.user}</span><span className="text-xs text-muted-foreground">/ free referral</span></div>
                <div className="text-xs text-muted-foreground">Paid referral (any batch): <span className="font-bold text-foreground">₹{t.collab}</span></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Minimum withdrawal: <span className="font-semibold text-foreground">₹1,000</span>. Payouts credit after the friend's batch purchase is confirmed.
        </p>
      </div>

      <Card className="mt-6 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/15 p-2.5"><Crown className="h-5 w-5 text-amber-600" /></div>
            <div>
              <div className="text-sm font-bold">Become a Collaborator</div>
              <p className="text-xs text-muted-foreground">
                Higher payouts (₹400 / ₹600 / ₹1,000) on every Essential / Prime / Elite referral. Apply once, approved by admin.
              </p>
            </div>
          </div>
          <Button asChild className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
            <Link to="/dedicated-program">Join now <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>

      {/* Withdrawal history */}
      {withdraws.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Your withdrawals</h3>
          <div className="space-y-2">
            {withdraws.map((w) => (
              <Card key={w.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      ₹{Number(w.amount).toLocaleString("en-IN")}
                      {w.status === "pending" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700"><Clock className="h-3 w-3" /> Pending</span>}
                      {w.status === "paid" && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Paid</span>}
                      {w.status === "rejected" && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700"><XCircle className="h-3 w-3" /> Rejected</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(w.created_at).toLocaleString()}
                      {w.bank_account_number ? <> · A/C ****{w.bank_account_number.slice(-4)} ({w.bank_ifsc})</> : null}
                      {w.upi_id ? <> · UPI {w.upi_id}</> : null}
                    </div>
                    {w.admin_note && <div className="mt-1 text-[11px] italic text-muted-foreground">Admin: {w.admin_note}</div>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          <Users className="mr-1.5 inline h-4 w-4" /> Friends you've invited ({info?.invited.length ?? 0})
        </h3>
        {!info?.invited.length ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No referrals yet. Share your code above!</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {info.invited.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm font-medium">{r.profiles?.full_name ?? r.profiles?.email ?? "User"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.batch_tier ? <> · <span className="uppercase">{r.batch_tier}</span></> : null}
                      {r.paid_out ? " · paid out" : ""}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-emerald-600">+₹{Number(r.referrer_bonus).toLocaleString("en-IN")}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function WithdrawDialog({ available, onDone }: { available: number; onDone: () => void }) {
  const req = useServerFn(requestWithdrawal);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(1000);
  const [holder, setHolder] = useState("");
  const [acc, setAcc] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (amount < 1000) return toast.error("Minimum withdrawal is ₹1000");
    if (amount > available) return toast.error(`Only ₹${available} available`);
    if (!holder.trim() || !acc.trim() || !ifsc.trim()) return toast.error("Bank details required");
    setBusy(true);
    try {
      await req({ data: { amount, account_holder: holder, account_number: acc, ifsc, upi_id: upi || null, note: note || null } });
      toast.success("Withdrawal requested. We'll pay within 48h.");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-gradient-primary" disabled={available < 1000}>
          <Landmark className="mr-1.5 h-4 w-4" /> Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw earnings</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount (₹)</Label>
            <Input type="number" min={1000} max={available} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
            <div className="mt-1 text-[11px] text-muted-foreground">Available ₹{available.toLocaleString("en-IN")} · Minimum ₹1,000</div>
          </div>
          <div>
            <Label>Account holder name</Label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="As per bank" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Account number</Label>
              <Input value={acc} onChange={(e) => setAcc(e.target.value)} />
            </div>
            <div>
              <Label>IFSC</Label>
              <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div>
            <Label>UPI ID <span className="text-muted-foreground">(optional, faster)</span></Label>
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="you@upi" />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request withdrawal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
