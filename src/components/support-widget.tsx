import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Headset, X, Send, Loader2, ChevronRight, ChevronLeft, Search, MessageCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { getMyTicket, sendSupportMessage, setSupportMode } from "@/lib/support.functions";
import { HELP_TOPICS, TELEGRAM_SUPPORT_URL, type HelpNode, type HelpTopic } from "@/lib/support-topics";
import { cn } from "@/lib/utils";

type Msg = { id: string; sender: "user" | "ai" | "admin"; content: string; created_at: string };

const POS_KEY = "neetiq_support_pos";
const HIDE_KEY = "neetiq_support_hidden"; // session-only: reappears on next visit
const FAB = 48;

/* ---------------- tiny markdown renderer (bold + line breaks) ------------- */
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">
      {text.split("\n\n").map((para, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {para.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) =>
            chunk.startsWith("**") && chunk.endsWith("**") ? (
              <strong key={j} className="font-semibold text-foreground">{chunk.slice(2, -2)}</strong>
            ) : (
              <span key={j}>{chunk}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/* ---------------- flatten for search -------------------------------------- */
type FlatLeaf = { node: HelpNode; trail: string[]; topic: HelpTopic };
function flatten(): FlatLeaf[] {
  const out: FlatLeaf[] = [];
  const walk = (node: HelpNode, trail: string[], topic: HelpTopic) => {
    if (node.answer) out.push({ node, trail, topic });
    node.children?.forEach((c) => walk(c, [...trail, node.title], topic));
  };
  HELP_TOPICS.forEach((t) => t.children?.forEach((c) => walk(c, [t.title], t)));
  return out;
}

export function SupportWidget() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // help-tree navigation
  const [topic, setTopic] = useState<HelpTopic | null>(null);
  const [stack, setStack] = useState<HelpNode[]>([]); // nodes below the topic
  const [query, setQuery] = useState("");

  // chat
  const [chat, setChat] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useServerFn(getMyTicket);
  const sendMsg = useServerFn(sendSupportMessage);
  const setModeFn = useServerFn(setSupportMode);

  const dragRef = useRef({ active: false, moved: false, dx: 0, dy: 0 });
  const allLeaves = useMemo(flatten, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(HIDE_KEY) === "1") setHidden(true);
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === "number" && typeof p?.y === "number") setPos(p);
      }
    } catch { /* ignore */ }
  }, []);

  const hide =
    !user || loading || hidden || path === "/" || path.startsWith("/login") || path.startsWith("/admin");

  async function load() {
    try {
      const r = await fetchTicket();
      setMessages((r.messages ?? []) as Msg[]);
    } catch { /* ignore */ }
  }

  useEffect(() => { if (chat && user) load(); }, [chat, user?.id]);
  useEffect(() => {
    if (!chat || !user) return;
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, [chat, user?.id]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [topic?.id, stack.length, chat]);

  async function openChat(prefill?: string) {
    setChat(true);
    setBusy(true);
    try { await setModeFn({ data: { mode: "team" } }); } catch { /* ignore */ }
    finally { setBusy(false); }
    if (prefill) setInput(prefill);
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages((p) => [...p, { id: `tmp-${Date.now()}`, sender: "user", content: text, created_at: new Date().toISOString() }]);
    setBusy(true);
    try { await sendMsg({ data: { content: text } }); await load(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }

  function resetNav() { setTopic(null); setStack([]); setQuery(""); setChat(false); }
  function goBack() {
    if (chat) { setChat(false); return; }
    if (stack.length) { setStack((s) => s.slice(0, -1)); return; }
    if (topic) { setTopic(null); return; }
    setOpen(false);
  }

  function removeWidget() {
    setHidden(true);
    try { sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* ignore */ }
  }

  /* ---- FAB drag ---- */
  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const startX = pos?.x ?? window.innerWidth - FAB - 16;
    const startY = pos?.y ?? window.innerHeight - FAB - 80;
    dragRef.current = { active: true, moved: false, dx: e.clientX - startX, dy: e.clientY - startY };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d.active) return;
    let nx = e.clientX - d.dx;
    let ny = e.clientY - d.dy;
    if (!d.moved && (Math.abs(nx - (pos?.x ?? nx)) > 4 || Math.abs(ny - (pos?.y ?? ny)) > 4)) d.moved = true;
    nx = Math.max(8, Math.min(window.innerWidth - FAB - 8, nx));
    ny = Math.max(8, Math.min(window.innerHeight - FAB - 8, ny));
    setPos({ x: nx, y: ny });
  }
  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = { ...d, active: false };
    if (d.moved) { try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* ignore */ } }
    else { resetNav(); setOpen(true); }
  }

  if (hide) return null;

  const fabStyle: CSSProperties = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {};
  const current: HelpNode | null = stack.length ? stack[stack.length - 1] : topic;
  const isAnswer = !!current?.answer;
  const searching = query.trim().length > 1;
  const results = searching
    ? allLeaves.filter((l) => {
        const q = query.toLowerCase();
        return l.node.title.toLowerCase().includes(q) ||
          l.topic.title.toLowerCase().includes(q) ||
          (l.node.answer ?? "").toLowerCase().includes(q);
      }).slice(0, 12)
    : [];

  const crumb = [topic?.title, ...stack.map((s) => s.title)].filter(Boolean).join(" › ");

  return (
    <>
      {!open && (
        <div style={fabStyle} className={cn("fixed z-[90] select-none", !pos && "bottom-20 right-4 sm:bottom-6")}>
          <button
            onClick={removeWidget}
            aria-label="Remove support button"
            className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
          <button
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="flex h-12 w-12 cursor-grab touch-none items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-elegant transition-transform hover:scale-105 active:cursor-grabbing"
            aria-label="Open support"
          >
            <Headset className="h-5 w-5" />
          </button>
        </div>
      )}

      <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetNav(); }}>
        <SheetContent
          side="bottom"
          className="flex h-[88vh] flex-col gap-0 rounded-t-3xl border-border p-0 sm:mx-auto sm:max-w-lg"
        >
          {/* grabber */}
          <div className="flex justify-center pt-2.5">
            <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          {/* header */}
          <div className="flex items-center gap-2 px-4 pb-3 pt-2">
            {(topic || chat) && (
              <button onClick={goBack} className="-ml-1 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Back">
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold">
                {chat ? "Chat with our team" : current ? current.title : "How can we help?"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {chat ? "We usually reply within a few hours" : crumb || "Pick the area your problem is related to"}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ---------------- CHAT ---------------- */}
          {chat ? (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 pb-2">
                {messages.length === 0 && (
                  <div className="rounded-2xl bg-secondary p-3 text-sm">
                    Describe your issue in a line or two 👇 Adding a screenshot detail and the time it happened gets you a faster answer.
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.sender === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      m.sender === "user"
                        ? "bg-primary text-primary-foreground"
                        : m.sender === "admin"
                          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
                          : "bg-secondary text-foreground",
                    )}>
                      {m.sender !== "user" && (
                        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
                          {m.sender === "admin" ? "Team" : "Assistant"}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap leading-snug">{m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type your issue…"
                  disabled={busy}
                />
                <Button size="icon" className="shrink-0 bg-gradient-primary" onClick={send} disabled={busy || !input.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 pb-4">
                {/* search — only at the root */}
                {!topic && (
                  <div className="relative mb-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search help — “withdraw”, “mock limit”, “payment failed”…"
                      className="pl-9"
                    />
                  </div>
                )}

                {/* search results */}
                {searching && (
                  <div className="space-y-1.5">
                    {results.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                        Nothing matched. Try another word, or tap <strong>Chat with our team</strong> below.
                      </div>
                    )}
                    {results.map((r) => (
                      <button
                        key={r.topic.id + r.trail.join() + r.node.id}
                        onClick={() => { setTopic(r.topic); setStack([r.node]); setQuery(""); }}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40"
                      >
                        <r.topic.icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{r.node.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{r.trail.join(" › ")}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}

                {/* root: topic grid */}
                {!searching && !topic && (
                  <div className="grid grid-cols-2 gap-2">
                    {HELP_TOPICS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTopic(t)}
                        className="flex h-full flex-col gap-1.5 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-sm"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <t.icon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-semibold leading-tight">{t.title}</span>
                        {t.desc && <span className="text-[11px] leading-snug text-muted-foreground">{t.desc}</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* branch: list of children */}
                {!searching && current && !isAnswer && (
                  <div className="space-y-1.5">
                    {!stack.length && (
                      <div className="mb-2 rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
                        What kind of issue is it?
                      </div>
                    )}
                    {(current.children ?? []).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setStack((s) => [...s, c])}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{c.title}</span>
                          {c.desc && <span className="block truncate text-[11px] text-muted-foreground">{c.desc}</span>}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}

                {/* leaf: the answer */}
                {!searching && current && isAnswer && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-4">
                      <RichText text={current.answer!} />
                    </div>

                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                      <div className="text-sm font-semibold">Did this solve your problem?</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        If your problem is still not solved, contact us on Telegram or chat with our team right here.
                      </p>
                      <div className="mt-3 grid gap-2">
                        <a
                          href={TELEGRAM_SUPPORT_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-elegant hover:opacity-95"
                        >
                          <Send className="h-4 w-4" /> Contact us on Telegram
                        </a>
                        <Button
                          variant="outline"
                          onClick={() => openChat(`[${crumb}] `)}
                          className="w-full"
                        >
                          <MessageCircle className="mr-1.5 h-4 w-4" /> Chat with our team
                        </Button>
                        <Button variant="ghost" size="sm" onClick={resetNav} className="w-full text-muted-foreground">
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Yes, back to all topics
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* persistent footer */}
              <div className="border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openChat()}>
                    <MessageCircle className="mr-1.5 h-4 w-4" /> Chat with team
                  </Button>
                  <a
                    href={TELEGRAM_SUPPORT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-md bg-gradient-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95"
                  >
                    <Send className="h-4 w-4" /> Telegram
                  </a>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
