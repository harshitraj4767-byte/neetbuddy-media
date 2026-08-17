import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { applyForCollaboratorProgram, getMyCollaboratorProgram } from "@/lib/collaborators.functions";

export const Route = createFileRoute("/dedicated-program")({
  head: () => ({ meta: [{ title: "Dedicated Program — Neet Buddy" }] }),
  component: DedicatedProgramPage,
});

const COMMISSIONS = [
  { tier: "Essential", amount: 400 },
  { tier: "Prime", amount: 600 },
  { tier: "Elite", amount: 1000 },
] as const;


function DedicatedProgramPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const apply = useServerFn(applyForCollaboratorProgram);
  const fetchMine = useServerFn(getMyCollaboratorProgram);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [promo, setPromo] = useState("");
  const [months, setMonths] = useState(1);

  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => { if (user) setEmail(user.email ?? ""); }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    fetchMine().then((r) => { if (r.program) nav({ to: "/collaborators" }); }).catch(() => {});
  }, [user?.id]);

  const submit = async () => {
    if (!agreed) { toast.error("Please accept the terms first"); return; }
    if (!name || !contact || !email || !promo) { toast.error("Fill all fields"); return; }
    if (months < 1) { toast.error("Minimum commitment is 1 month"); return; }
    setBusy(true);
    try {
      await apply({ data: { name, contact, email, promo_asset: promo, months, accepted_terms: true } });
      toast.success("Application submitted!");
      nav({ to: "/collaborators" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <PageShell
      eyebrow="Dedicated Program"
      title="Join Neet Buddy Collaborators"
      description="Apply to become a dedicated collaborator and earn a fixed commission per batch purchased through your coupon."
    >
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact">Contact number</Label>
              <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={60} placeholder="+91 ..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email ID</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="months">Commitment (months)</Label>
              <Input id="months" type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="promo">Your promotion asset</Label>
            <Textarea id="promo" value={promo} onChange={(e) => setPromo(e.target.value)} maxLength={500}
              placeholder="YouTube channel / Telegram group / Instagram page / Website URL where you will promote" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Commission plan (per batch purchase via your coupon)</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {COMMISSIONS.map((c) => (
                <div key={c.tier} className="flex flex-col gap-1 rounded-xl border border-border p-3">
                  <span className="text-sm font-bold">{c.tier}</span>
                  <span className="text-xs text-muted-foreground">₹{c.amount} per purchase</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">There is no investment or revenue-share plan. You earn a fixed commission each time someone buys a batch using your coupon.</p>
          </div>


          <div className="rounded-xl border bg-secondary/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Neet Buddy Terms &amp; Conditions
            </div>
            <div className="prose prose-sm max-h-72 max-w-none overflow-y-auto rounded-md bg-background p-3 text-xs leading-relaxed">
              <p className="font-semibold">1. Participation Rules</p>
              <ul>
                <li>You cannot leave the program midway. Commitment is required until the end of the program or cycle.</li>
                <li>You can request withdrawals only at the end of the week or month, as specified.</li>
              </ul>
              <p className="font-semibold">2. Account Integrity</p>
              <ul>
                <li>Creating fake users or using bots is strictly forbidden.</li>
                <li>Users must provide accurate and truthful information during registration.</li>
              </ul>
              <p className="font-semibold">3. Withdrawals &amp; Earnings</p>
              <ul>
                <li>The minimum withdrawal limit is ₹100 (or as per your selected plan).</li>
                <li>Earnings from users joining through your referral links will be updated in your dashboard automatically.</li>
                <li>Neet Buddy reserves the right to withhold funds in case of suspicious or fraudulent activity.</li>
              </ul>
              <p className="font-semibold">4. Content &amp; Usage</p>
              <ul>
                <li>All content provided on Neet Buddy is for educational and personal use only.</li>
                <li>Users are prohibited from redistributing, copying, or selling any content without prior permission.</li>
              </ul>
              <p className="font-semibold">5. Security &amp; Privacy</p>
              <ul>
                <li>Your account is personal. Sharing login credentials is prohibited.</li>
                <li>Neet Buddy protects user data according to applicable privacy policies. Any misuse may lead to account termination.</li>
              </ul>
              <p className="font-semibold">6. Program Changes</p>
              <ul>
                <li>Neet Buddy reserves the right to modify, suspend, or terminate any feature, reward, or program without prior notice.</li>
                <li>Users will be notified of significant changes through official communication channels.</li>
              </ul>
              <p className="font-semibold">7. Liability</p>
              <ul>
                <li>Neet Buddy is not responsible for any losses, technical issues, or disputes arising from participation in the program.</li>
                <li>Users must comply with all applicable laws and regulations while using the platform.</li>
              </ul>
              <p className="font-semibold">8. General</p>
              <ul>
                <li>By participating, you agree to abide by all terms and conditions mentioned herein.</li>
                <li>All rights are reserved by Neet Buddy 2026.</li>
              </ul>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <span>I have read and carefully understood the Neet Buddy Terms &amp; Conditions, and I agree to all of them.</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" asChild className="flex-1"><Link to="/referrals">Cancel</Link></Button>
            <Button onClick={submit} disabled={busy || !agreed} className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit application"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
