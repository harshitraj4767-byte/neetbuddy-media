import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, TrendingUp, Wallet, Crown, ArrowRight, Ticket, Copy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyCollaboratorProgram } from "@/lib/collaborators.functions";

export const Route = createFileRoute("/collaborators")({
  head: () => ({ meta: [{ title: "Collaborators — Neet Buddy" }] }),
  component: CollaboratorsPage,
});

function CollaboratorsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fetch = useServerFn(getMyCollaboratorProgram);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetch>> | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const reload = () => {
      fetch().then((d) => { if (alive) setData(d); }).catch(() => {});
    };
    reload();
    // Live updates: refresh whenever a new referral lands under me OR a new
    // payment from one of my invitees completes.
    const ch = supabase
      .channel(`collab-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "referrals", filter: `referrer_id=eq.${user.id}` },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_orders" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "collaborator_programs", filter: `user_id=eq.${user.id}` },
        () => reload(),
      )
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
  }, [user?.id, fetch]);

  if (!data) {
    return (
      <PageShell eyebrow="Program" title="Collaborators">
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      </PageShell>
    );
  }

  if (!data.program) {
    return (
      <PageShell eyebrow="Program" title="Collaborators" description="You haven't joined the collaborator program yet.">
        <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent">
          <CardContent className="space-y-3 p-6 text-center">
            <Crown className="mx-auto h-10 w-10 text-amber-600" />
            <div className="text-base font-bold">Become a Neet Buddy collaborator</div>
            <p className="text-sm text-muted-foreground">Earn a fixed commission for every batch purchased through your coupon — Essential ₹400 · Prime ₹600 · Elite ₹1000.</p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
              <Link to="/dedicated-program">Apply now <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const s = data.stats;
  const p = data.program;
  const totalCommission = Number(data.couponStats?.total_commission ?? 0);
  const totalRedemptions = Number(data.couponStats?.total_redemptions ?? 0);
  const statusColor =
    p.status === "approved" ? "bg-emerald-500/15 text-emerald-700" :
    p.status === "rejected" ? "bg-red-500/15 text-red-700" :
    p.status === "ended" ? "bg-zinc-500/15 text-zinc-700" :
    "bg-amber-500/15 text-amber-700";

  return (
    <PageShell
      eyebrow="Program"
      title="Collaborator Dashboard"
      description={`Welcome ${p.name}. Earn a fixed commission on every batch bought through your coupons.`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge className={statusColor}>Status: {p.status}</Badge>
        <Badge variant="outline">Min withdrawal ₹{Number(p.min_withdrawal).toFixed(0)}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4 text-blue-600" />} label="Users invited" value={String(s?.total_invited ?? 0)} />
        <StatCard icon={<Ticket className="h-4 w-4 text-violet-600" />} label="Coupon sales" value={String(totalRedemptions)} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} label="Commission per buy" value="₹400–₹1000" />
        <StatCard icon={<Wallet className="h-4 w-4 text-amber-600" />} label="Total commission" value={`₹${totalCommission.toFixed(2)}`} highlight />
      </div>


      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Invited users ({data.invited.length})
      </h3>
      {data.invited.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No invited users yet. Share your referral code to start earning.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.invited.map((u: any) => (
            <Card key={u.user_id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="text-sm font-medium">{u.full_name ?? u.email ?? "User"}</div>
                  <div className="text-xs text-muted-foreground">Joined {new Date(u.joined_at).toLocaleDateString()}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">Invited</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Coupon commissions
      </h3>
      <Card className="mb-3 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Earned from your coupons
            </div>
            <div className="text-2xl font-bold text-emerald-700">
              ₹{Number(data.couponStats?.total_commission ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div><b>{Number(data.couponStats?.total_redemptions ?? 0)}</b> active redemptions</div>
            <div className="mt-1">Essential ₹400 · Prime ₹600 · Elite ₹1000 per purchase</div>
          </div>
        </CardContent>
      </Card>
      {data.coupons.length === 0 ? (
        <Card><CardContent className="p-4 text-center text-xs text-muted-foreground">
          No coupons assigned to you yet. Ask admin to create a coupon tied to your account.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.coupons.map((c: any) => (
            <Card key={c.coupon_id}>
              <CardContent className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-amber-600" />
                    <span className="font-mono text-sm font-bold">{c.code}</span>
                    {!c.active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground truncate">
                    {c.batch_title ?? "—"} · {Number(c.redemptions)} used
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-600">₹{Number(c.commission).toFixed(0)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">earned</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => {
                    navigator.clipboard.writeText(c.code).then(() => {/* toast optional */});
                  }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent" : ""}>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
