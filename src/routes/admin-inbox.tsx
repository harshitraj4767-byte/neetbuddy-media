import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Send, CheckCircle2, MessageCircle, Bot, Sparkles, Star,
  Trash2, RotateCcw, Bug, Lightbulb, MessagesSquare, ChevronLeft, Inbox as InboxIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listOpenTickets, getTicketMessages, adminReply, closeTicket, adminBotReply,
} from "@/lib/support.functions";
import {
  adminListFeedback, adminMarkFeedbackResolved, adminDeleteFeedback,
} from "@/lib/admin-feedback.functions";

export const Route = createFileRoute("/admin-inbox")({
  head: () => ({ meta: [{ title: "Admin · Inbox — Neet Buddy" }] }),
  component: AdminInbox,
});

function AdminInbox() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/login" }); return; }
    if (!isAdmin) { nav({ to: "/dashboard" }); return; }
  }, [user, isAdmin, loading, nav]);

  return (
    <PageShell>
      <div className="mb-4 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin"><ChevronLeft className="mr-1 h-4 w-4" /> Back to admin</Link>
        </Button>
      </div>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <InboxIcon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Admin</div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        </div>
      </div>

      <Tabs defaultValue="support" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="support" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Support tickets</TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5"><Star className="h-3.5 w-3.5" /> Feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="support" className="mt-4">
          <SupportPanel />
        </TabsContent>
        <TabsContent value="feedback" className="mt-4">
          <FeedbackPanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

/* ----------------------------- Support ----------------------------- */

type Ticket = { id: string; user_id: string; mode: string; status: string; updated_at: string };
type Msg = { id: string; sender: "user" | "ai" | "admin"; content: string; created_at: string };

function SupportPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const fnList = useServerFn(listOpenTickets);
  const fnMsgs = useServerFn(getTicketMessages);
  const fnReply = useServerFn(adminReply);
  const fnClose = useServerFn(closeTicket);
  const fnBot = useServerFn(adminBotReply);

  async function loadTickets() {
    setLoadingTickets(true);
    try { const r = await fnList(); setTickets(r.tickets as Ticket[]); }
    catch (e: any) { toast.error(e?.message ?? "Could not load tickets"); }
    finally { setLoadingTickets(false); }
  }
  useEffect(() => { loadTickets(); /* eslint-disable-next-line */ }, []);

  async function loadMsgs(id: string) {
    setSelected(id);
    try { const r = await fnMsgs({ data: { ticket_id: id } }); setMessages(r.messages as Msg[]); }
    catch (e: any) { toast.error(e?.message ?? "load failed"); }
  }
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => loadMsgs(selected), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function send() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await fnReply({ data: { ticket_id: selected, content: reply.trim() } });
      setReply(""); await loadMsgs(selected);
    } catch (e: any) { toast.error(e?.message ?? "Send failed"); }
    finally { setBusy(false); }
  }
  async function botDraft() {
    if (!selected) return;
    setBotBusy(true);
    try {
      const r = await fnBot({ data: { ticket_id: selected, send: false } });
      setReply(r.reply ?? "");
      toast.success("Bot drafted — edit & send");
    } catch (e: any) { toast.error(e?.message ?? "Bot failed"); }
    finally { setBotBusy(false); }
  }
  async function botSend() {
    if (!selected) return;
    setBotBusy(true);
    try {
      await fnBot({ data: { ticket_id: selected, send: true } });
      await loadMsgs(selected);
      toast.success("Bot replied");
    } catch (e: any) { toast.error(e?.message ?? "Bot failed"); }
    finally { setBotBusy(false); }
  }
  async function close() {
    if (!selected) return;
    await fnClose({ data: { ticket_id: selected } });
    setSelected(null); setMessages([]); await loadTickets();
    toast.success("Ticket closed");
  }

  return (
    <div className="grid gap-3 md:grid-cols-[280px,1fr]">
      <Card><CardContent className="p-2">
        <div className="mb-2 flex items-center justify-between px-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Open tickets</div>
          <Button variant="ghost" size="sm" onClick={loadTickets}><RotateCcw className="h-3 w-3" /></Button>
        </div>
        {loadingTickets ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : tickets.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No open tickets</div>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.id}>
                <button onClick={() => loadMsgs(t.id)}
                  className={cn("w-full p-3 text-left text-sm hover:bg-secondary rounded-lg",
                    selected === t.id && "bg-secondary")}>
                  <div className="flex items-center gap-2 font-semibold">
                    <MessageCircle className="h-3.5 w-3.5" /> {t.user_id.slice(0, 8)}…
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(t.updated_at).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Card><CardContent className="flex h-[65vh] flex-col p-0">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a ticket</div>
        ) : (
          <>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.sender === "admin" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    m.sender === "admin" ? "bg-gradient-primary text-primary-foreground"
                      : m.sender === "user" ? "bg-secondary" : "bg-amber-100 text-amber-900",
                  )}>
                    <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70">{m.sender}</div>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-2 pt-2">
              <Button onClick={botDraft} disabled={botBusy} variant="outline" size="sm" className="gap-1.5">
                {botBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />} Bot draft
              </Button>
              <Button onClick={botSend} disabled={botBusy} variant="outline" size="sm" className="gap-1.5">
                {botBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 text-primary" />} Bot reply
              </Button>
            </div>
            <div className="flex items-center gap-2 border-t border-border p-2">
              <Input value={reply} onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Type a reply…" />
              <Button onClick={send} disabled={busy} className="bg-gradient-primary">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              <Button onClick={close} variant="outline" size="icon" title="Close ticket">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </Button>
            </div>
          </>
        )}
      </CardContent></Card>
    </div>
  );
}

/* ----------------------------- Feedback ----------------------------- */

type FbRow = {
  id: string; user_id: string | null; rating: number;
  category: string; message: string; created_at: string;
  resolved?: boolean | null; full_name: string | null; email: string | null;
};

const CAT_META: Record<string, { label: string; icon: typeof Bug; tint: string }> = {
  bug: { label: "Bug", icon: Bug, tint: "bg-rose-500" },
  idea: { label: "Idea", icon: Lightbulb, tint: "bg-amber-500" },
  other: { label: "Other", icon: MessagesSquare, tint: "bg-sky-500" },
};

function FeedbackPanel() {
  const [rows, setRows] = useState<FbRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "bug" | "idea" | "other">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fnList = useServerFn(adminListFeedback);
  const fnResolve = useServerFn(adminMarkFeedbackResolved);
  const fnDelete = useServerFn(adminDeleteFeedback);

  async function load() {
    try { const r = await fnList(); setRows(r.rows as FbRow[]); }
    catch (e: any) { toast.error(e?.message ?? "Could not load"); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function toggleResolved(r: FbRow) {
    setBusyId(r.id);
    try {
      await fnResolve({ data: { id: r.id, resolved: !r.resolved } });
      setRows((rows) => rows?.map((x) => x.id === r.id ? { ...x, resolved: !r.resolved } : x) ?? null);
    } catch (e: any) { toast.error(e?.message ?? "Update failed"); }
    finally { setBusyId(null); }
  }
  async function remove(r: FbRow) {
    if (!confirm("Delete this feedback?")) return;
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
      acc.total++; acc.avg += r.rating;
      if (r.resolved) acc.resolved++; else acc.open++;
      return acc;
    },
    { total: 0, avg: 0, open: 0, resolved: 0 },
  );
  const avgRating = stats.total ? (stats.avg / stats.total).toFixed(1) : "—";

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={load}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refresh</Button>
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
                      <Button size="sm" variant={r.resolved ? "outline" : "default"}
                        className={r.resolved ? "" : "bg-emerald-600 text-white hover:bg-emerald-700"}
                        onClick={() => toggleResolved(r)} disabled={busyId === r.id}>
                        {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                        {r.resolved ? "Reopen" : "Resolve"}
                      </Button>
                      <Button size="sm" variant="ghost"
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10"
                        onClick={() => remove(r)} disabled={busyId === r.id}>
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
    </div>
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
