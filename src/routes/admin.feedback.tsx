import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Star, Trash2, CheckCircle2, RotateCcw, Bug, Lightbulb, MessagesSquare, ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  adminListFeedback,
  adminMarkFeedbackResolved,
  adminDeleteFeedback,
} from "@/lib/admin-feedback.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/feedback")({
  head: () => ({ meta: [{ title: "Admin · Feedback — Neet Buddy" }] }),
  component: AdminFeedback,
});

type Row = {
  id: string;
  user_id: string | null;
  rating: number;
  category: "bug" | "idea" | "other" | string;
  message: string;
  created_at: string;
  resolved?: boolean | null;
  full_name: string | null;
  email: string | null;
};

const CAT_META: Record<string, { label: string; icon: typeof Bug; tint: string }> = {
  bug: { label: "Bug", icon: Bug, tint: "bg-rose-500" },
  idea: { label: "Idea", icon: Lightbulb, tint: "bg-amber-500" },
  other: { label: "Other", icon: MessagesSquare, tint: "bg-sky-500" },
};

function AdminFeedback() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "bug" | "idea" | "other">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fnList = useServerFn(adminListFeedback);
  const fnResolve = useServerFn(adminMarkFeedbackResolved);
  const fnDelete = useServerFn(adminDeleteFeedback);

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/login" }); return; }
    if (!isAdmin) { nav({ to: "/dashboard" }); return; }
  }, [user, isAdmin, loading, nav]);

  async function load() {
    try {
      const r = await fnList();
      setRows(r.rows as Row[]);
    } catch (e: any) { toast.error(e?.message ?? "Could not load feedback"); }
  }
  useEffect(() => { if (user && isAdmin) load(); /* eslint-disable-next-line */ }, [user?.id, isAdmin]);

  async function toggleResolved(r: Row) {
    setBusyId(r.id);
    try {
      await fnResolve({ data: { id: r.id, resolved: !r.resolved } });
      setRows((rows) => rows?.map((x) => x.id === r.id ? { ...x, resolved: !r.resolved } : x) ?? null);
    } catch (e: any) { toast.error(e?.message ?? "Update failed"); }
    finally { setBusyId(null); }
  }

  async function remove(r: Row) {
    if (!confirm("Delete this feedback? This cannot be undone.")) return;
    setBusyId(r.id);
    try {
      await fnDelete({ data: { id: r.id } });
      setRows((rows) => rows?.filter((x) => x.id !== r.id) ?? null);
      toast.success("Deleted");
    } catch (e: any) { toast.error(e?.message ?? "Delete failed"); }
    finally { setBusyId(null); }
  }

  const filtered = (rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "open") return !r.resolved;
    if (filter === "resolved") return !!r.resolved;
    return r.category === filter;
  });

  const stats = (rows ?? []).reduce(
    (acc, r) => {
      acc.total++;
      acc.avg += r.rating;
      if (r.resolved) acc.resolved++; else acc.open++;
      acc.byCat[r.category] = (acc.byCat[r.category] ?? 0) + 1;
      return acc;
    },
    { total: 0, avg: 0, open: 0, resolved: 0, byCat: {} as Record<string, number> },
  );
  const avgRating = stats.total ? (stats.avg / stats.total).toFixed(1) : "—";

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ChevronLeft className="mr-1 h-4 w-4" /> Back to admin</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={load}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refresh</Button>
      </div>

      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">User feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">All feedback submitted by users — bugs, ideas, and general thoughts.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total" value={String(stats.total)} />
        <Stat label="Avg rating" value={avgRating} icon={<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />} />
        <Stat label="Open" value={String(stats.open)} />
        <Stat label="Resolved" value={String(stats.resolved)} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} className="mb-4">
        <TabsList className="flex w-full flex-wrap gap-1">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="bug">Bugs</TabsTrigger>
          <TabsTrigger value="idea">Ideas</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
      </Tabs>

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No feedback in this view.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const meta = CAT_META[r.category] ?? CAT_META.other;
            const Icon = meta.icon;
            return (
              <Card key={r.id} className={cn(r.resolved && "opacity-70")}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-white", meta.tint)}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-semibold capitalize">{meta.label}</span>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
                      ))}
                    </div>
                    {r.resolved && <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">Resolved</Badge>}
                    <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 text-sm">{r.message}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="text-xs text-muted-foreground">
                      From <span className="font-medium text-foreground">{r.full_name ?? "User"}</span>
                      {r.email && <span> · {r.email}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={r.resolved ? "outline" : "default"}
                        className={r.resolved ? "" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                        onClick={() => toggleResolved(r)}
                        disabled={busyId === r.id}
                      >
                        {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                        {r.resolved ? "Reopen" : "Resolve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10"
                        onClick={() => remove(r)}
                        disabled={busyId === r.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-soft">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-lg font-bold">{icon}{value}</div>
    </div>
  );
}
