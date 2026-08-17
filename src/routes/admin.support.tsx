import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, CheckCircle2, MessageCircle, Bot, Sparkles } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { listOpenTickets, getTicketMessages, adminReply, closeTicket, adminBotReply } from "@/lib/support.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  head: () => ({ meta: [{ title: "Admin · Support — Neet Buddy" }] }),
  component: AdminSupport,
});

type Ticket = { id: string; user_id: string; mode: string; status: string; updated_at: string };
type Msg = { id: string; sender: "user" | "ai" | "admin"; content: string; created_at: string };

function AdminSupport() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const fnList = useServerFn(listOpenTickets);
  const fnMsgs = useServerFn(getTicketMessages);
  const fnReply = useServerFn(adminReply);
  const fnClose = useServerFn(closeTicket);
  const fnBot = useServerFn(adminBotReply);
  const [botBusy, setBotBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  async function loadTickets() {
    try { const r = await fnList(); setTickets(r.tickets as Ticket[]); }
    catch (e: any) { toast.error(e?.message ?? "Not admin"); }
  }
  useEffect(() => { if (user) loadTickets(); }, [user?.id]);

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

  // Draft a reply with the bot (admin can edit before sending)
  async function botDraft() {
    if (!selected) return;
    setBotBusy(true);
    try {
      const r = await fnBot({ data: { ticket_id: selected, send: false } });
      setReply(r.reply ?? "");
      toast.success("Bot drafted a reply — edit & send");
    } catch (e: any) { toast.error(e?.message ?? "Bot failed"); }
    finally { setBotBusy(false); }
  }

  // Let the bot answer and send directly to the user
  async function botSend() {
    if (!selected) return;
    setBotBusy(true);
    try {
      await fnBot({ data: { ticket_id: selected, send: true } });
      await loadMsgs(selected);
      toast.success("Bot replied to the user");
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
    <PageShell eyebrow="Admin" title="Support tickets" description="Open tickets from users who chose 'Talk to Team'.">
      <div className="grid gap-4 md:grid-cols-[280px,1fr]">
        <Card><CardContent className="p-2">
          {tickets.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No open tickets</div>
          ) : (
            <ul className="divide-y divide-border">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button onClick={() => loadMsgs(t.id)}
                    className={cn("w-full p-3 text-left text-sm hover:bg-secondary",
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

        <Card><CardContent className="flex h-[70vh] flex-col p-0">
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
                  {botBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
                  Bot draft
                </Button>
                <Button onClick={botSend} disabled={botBusy} variant="outline" size="sm" className="gap-1.5">
                  {botBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                  Bot reply
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
    </PageShell>
  );
}
