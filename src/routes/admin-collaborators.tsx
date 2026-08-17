import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Crown, Users, TrendingUp, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { adminListCollaborators, adminUpdateCollaboratorStatus } from "@/lib/collaborators.functions";

export const Route = createFileRoute("/admin-collaborators")({
  head: () => ({ meta: [{ title: "Admin · Collaborators — Neet Buddy" }] }),
  component: AdminCollaborators,
});

function AdminCollaborators() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const list = useServerFn(adminListCollaborators);
  const update = useServerFn(adminUpdateCollaboratorStatus);

  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);
  useEffect(() => {
    if (!user || !isAdmin) return;
    list().then((r) => { setRows(r.rows); setLoaded(true); }).catch((e) => toast.error(e?.message ?? "Failed"));
  }, [user?.id, isAdmin]);

  useEffect(() => { setNotes(rows[idx]?.admin_notes ?? ""); }, [idx, rows.length]);

  if (loading || !loaded) {
    return <PageShell eyebrow="Admin" title="Collaborators"><div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div></PageShell>;
  }
  if (!isAdmin) {
    return <PageShell eyebrow="Admin" title="Restricted"><Card><CardContent className="p-5 text-sm">Admin only.</CardContent></Card></PageShell>;
  }
  if (rows.length === 0) {
    return <PageShell eyebrow="Admin" title="Collaborators"><Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No collaborator applications yet.</CardContent></Card></PageShell>;
  }

  const c = rows[idx];
  const setStatus = async (status: "approved" | "rejected" | "pending" | "ended") => {
    setBusy(true);
    try {
      await update({ data: { id: c.id, status, admin_notes: notes || undefined } });
      toast.success("Updated");
      const fresh = await list();
      setRows(fresh.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <PageShell eyebrow="Admin" title="Collaborators" description={`${rows.length} application(s). Swipe through to review.`}>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="outline" size="sm" asChild><Link to="/admin"><ChevronLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
        <div className="flex items-center gap-1.5 text-sm">
          <Button variant="outline" size="icon" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 text-xs text-muted-foreground">{idx + 1} / {rows.length}</span>
          <Button variant="outline" size="icon" disabled={idx >= rows.length - 1} onClick={() => setIdx(idx + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-bold"><Crown className="h-4 w-4 text-amber-600" /> {c.name}</div>
              <div className="text-xs text-muted-foreground">{c.profile?.email ?? c.email}</div>
            </div>
            <Badge variant="outline">{c.status}</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contact" value={c.contact} />
            <Field label="Email" value={c.email} />
            <Field label="Commitment" value={`${c.months} month(s)`} />
            <Field label="Plan" value={`Commission per batch · min withdrawal ₹${Number(c.min_withdrawal).toFixed(0)}`} />
            <Field label="Applied" value={new Date(c.created_at).toLocaleString()} />
            <Field label="Account name" value={c.profile?.full_name ?? "—"} />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Promotion asset</div>
            <div className="whitespace-pre-wrap rounded-lg border bg-secondary/40 p-3 text-sm">{c.promo_asset}</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={<Users className="h-4 w-4 text-blue-600" />} label="Invited" value={String(c.total_invited)} />
            <Stat icon={<TrendingUp className="h-4 w-4 text-violet-600" />} label="Coupon sales" value={String(c.total_redemptions ?? 0)} />
            <Stat icon={<Wallet className="h-4 w-4 text-amber-600" />} label="Commission earned" value={`₹${Number(c.total_commission ?? 0).toFixed(2)}`} highlight />
          </div>


          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admin notes</div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Internal notes…" maxLength={2000} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => setStatus(v as any)} disabled={busy}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Change status…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Mark pending</SelectItem>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
                <SelectItem value="ended">Mark ended</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setStatus("approved")} disabled={busy} className="bg-emerald-600 text-white hover:bg-emerald-700">Approve</Button>
            <Button onClick={() => setStatus("rejected")} disabled={busy} variant="destructive">Reject</Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-transparent" : ""}>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{icon}{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
