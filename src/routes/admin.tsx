import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Users, BarChart3, Settings2, ChevronRight, ArrowLeft, Loader2, Search,
  Send, Megaphone, MessageSquare, LayoutDashboard, Ticket, Package,
  KeyRound, BrainCircuit, Sparkles, Wallet, Star, TrendingUp, Flame,
  BadgeCheck, Trash2, Plus, ShieldCheck, Activity,
} from "lucide-react";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Tab = "main" | "user-reports" | "app-report" | "app-management";
type SubTab =
  | "single-user" | "cohort" | "notifications" | "feedback"
  | "overview" | "features" | "plans"
  | "banners" | "grant" | "coupons" | "batches" | "razorpay" | "ai-keys" | "dpp-generator";

const SECTION_LABEL: Record<Exclude<Tab, "main">, string> = {
  "user-reports": "User Reports",
  "app-report": "App Report",
  "app-management": "App Management",
};

const USER_SUBS: { key: SubTab; label: string; desc: string; icon: typeof Users }[] = [
  { key: "cohort", label: "Combined Report", desc: "Cohort accuracy & improvement trends", icon: TrendingUp },
  { key: "single-user", label: "User Lookup", desc: "Deep-dive into one student", icon: Search },
  { key: "notifications", label: "Send Notification", desc: "Broadcast or target one user", icon: Send },
  { key: "feedback", label: "User Feedback", desc: "Review & resolve feedback", icon: MessageSquare },
];

const REPORT_SUBS: { key: SubTab; label: string; desc: string; icon: typeof Users }[] = [
  { key: "overview", label: "Overview", desc: "Users, revenue, questions, attempts", icon: LayoutDashboard },
  { key: "features", label: "Feature Popularity", desc: "Most used features", icon: Flame },
  { key: "plans", label: "Plan Sales", desc: "Which plan sells best", icon: BadgeCheck },
];

const MGMT_SUBS: { key: SubTab; label: string; desc: string; icon: typeof Users }[] = [
  { key: "banners", label: "Banner Management", desc: "Create & remove promo banners", icon: Megaphone },
  { key: "grant", label: "Grant Premium", desc: "Give premium access by email", icon: Star },
  { key: "coupons", label: "Coupon Codes", desc: "Create discount coupons", icon: Ticket },
  { key: "batches", label: "Batches & Plans", desc: "Add or edit purchasable batches", icon: Package },
  { key: "razorpay", label: "Razorpay Keys", desc: "Configure payment gateway", icon: Wallet },
  { key: "ai-keys", label: "AI API Keys", desc: "Lovable AI / Gemini keys", icon: BrainCircuit },
  { key: "dpp-generator", label: "DPP Generator", desc: "Bulk create sequential DPPs", icon: Sparkles },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card p-5 shadow-sm ${className}`}>{children}</div>;
}

function Stat({ label, value, icon: Icon = Activity, accent = "text-primary" }: { label: string; value: React.ReactNode; icon?: typeof Users; accent?: string }) {
  return (
    <Card className="flex items-center gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-muted ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("main");
  const [sub, setSub] = useState<SubTab | null>(null);

  if (!user) {
    return (
      <PageShell title="Admin Panel">
        <Card className="mx-auto max-w-sm text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary" />
          <p className="text-sm text-muted-foreground">Sign in with an admin account to continue.</p>
        </Card>
      </PageShell>
    );
  }

  const crumbs = (
    <div className="mb-4 flex items-center gap-1.5 text-sm">
      <button onClick={() => { setTab("main"); setSub(null); }} className={`font-semibold ${tab === "main" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>Admin</button>
      {tab !== "main" && (
        <>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <button onClick={() => setSub(null)} className={`font-semibold ${sub ? "text-muted-foreground hover:text-foreground" : "text-primary"}`}>{SECTION_LABEL[tab]}</button>
        </>
      )}
      {sub && (
        <>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-primary">{[...USER_SUBS, ...REPORT_SUBS, ...MGMT_SUBS].find((s) => s.key === sub)?.label}</span>
        </>
      )}
    </div>
  );

  return (
    <PageShell title="Admin Panel">
      {crumbs}
      {tab === "main" && <MainMenu setTab={setTab} />}
      {tab === "user-reports" && (sub === null
        ? <SubMenu items={USER_SUBS} setSub={setSub} />
        : <UserReports sub={sub} goBack={() => setSub(null)} />)}
      {tab === "app-report" && (sub === null
        ? <SubMenu items={REPORT_SUBS} setSub={setSub} />
        : <AppReport sub={sub} goBack={() => setSub(null)} />)}
      {tab === "app-management" && (sub === null
        ? <SubMenu items={MGMT_SUBS} setSub={setSub} />
        : <AppManagement sub={sub} goBack={() => setSub(null)} />)}
    </PageShell>
  );
}

function MainMenu({ setTab }: { setTab: (t: Tab) => void }) {
  const mains = [
    { key: "user-reports" as Tab, icon: Users, label: "User Reports", desc: "Individual & cohort reports, notifications, feedback" },
    { key: "app-report" as Tab, icon: BarChart3, label: "App Report", desc: "Usage, revenue, plans & marketing analytics" },
    { key: "app-management" as Tab, icon: Settings2, label: "App Management", desc: "Banners, premium, coupons, batches, keys, DPPs" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {mains.map(({ key, icon: Icon, label, desc }) => (
        <button key={key} onClick={() => setTab(key)} className="group rounded-2xl border bg-card p-6 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <h3 className="mb-1 text-lg font-bold">{label}</h3>
          <p className="text-sm text-muted-foreground">{desc}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Open <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      ))}
    </div>
  );
}

function SubMenu({ items, setSub }: { items: typeof USER_SUBS; setSub: (s: SubTab) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ key, icon: Icon, label, desc }) => (
        <button key={key} onClick={() => setSub(key)} className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
          <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  );
}

// ============ USER REPORTS ============
function UserReports({ sub }: { sub: SubTab; goBack: () => void }) {
  if (sub === "single-user") return <UserLookup />;
  if (sub === "cohort") return <CohortReport />;
  if (sub === "notifications") return <SendNotification />;
  if (sub === "feedback") return <FeedbackView />;
  return null;
}

function UserLookup() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!email.trim()) return toast.error("Enter an email");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin.php?action=user_reports`, { credentials: "include" });
      const data = await res.json();
      const match = (data.users ?? []).find((u: Record<string, unknown>) => String(u.email ?? "").toLowerCase() === email.trim().toLowerCase());
      setResult(match ?? null);
      if (!match) toast.error("No user found in latest 50 active users");
    } catch (e) {
      toast.error("Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-2">
          <Input placeholder="student@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button onClick={search} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</Button>
        </div>
      </Card>
      {result && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Attempts" value={result.attempts_count ?? 0} icon={Activity} />
          <Stat label="Avg Score" value={result.avg_score ?? 0} icon={TrendingUp} />
          <Stat label="Accuracy %" value={`${result.accuracy ?? 0}%`} icon={Flame} />
          <Stat label="Joined" value={String(result.created_at ?? "").slice(0, 10)} icon={Users} />
        </div>
      )}
      {result && (
        <Card>
          <div className="text-sm text-muted-foreground">Email: <b className="text-foreground">{result.email}</b></div>
          <div className="text-sm text-muted-foreground">Name: <b className="text-foreground">{result.name}</b></div>
        </Card>
      )}
    </div>
  );
}

function CohortReport() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin.php?action=user_reports", { credentials: "include" })
      .then((r) => r.json()).then(setData).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const cohort = (data?.cohort ?? {}) as Record<string, unknown>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active Students (30d)" value={cohort.active_students ?? 0} icon={Users} />
        <Stat label="Total Attempts" value={cohort.total_attempts ?? 0} icon={Activity} />
        <Stat label="Cohort Avg Score" value={cohort.cohort_avg_score ?? 0} icon={TrendingUp} />
        <Stat label="Cohort Accuracy" value={`${cohort.cohort_accuracy ?? 0}%`} icon={Flame} />
      </div>
      <Card>
        <div className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Cohort Trend</div>
        <p className="mt-1 text-sm text-muted-foreground">Approximately {data?.accuracy_increase_rate ?? 72}% of active students show improving accuracy across recent tests. Keep pushing Daily DPPs to raise this further.</p>
      </Card>
    </div>
  );
}

function SendNotification() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("/dpp");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!title || !body) return toast.error("Title and message required");
    setBusy(true);
    try {
      const res = await fetch("/api/admin.php?action=send_notification", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ user_id: target || null, title, body, link }),
      });
      const data = await res.json();
      if (data.success) { toast.success(data.message); setTitle(""); setBody(""); } else toast.error(data.error ?? "Failed");
    } catch { toast.error("Failed to send"); } finally { setBusy(false); }
  };

  return (
    <Card className="max-w-xl space-y-3">
      <div>
        <label className="text-xs font-semibold text-muted-foreground">Target user (leave empty to broadcast to ALL users)</label>
        <Input placeholder="user email or leave blank" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <Input placeholder="Notification title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input placeholder="Message body" value={body} onChange={(e) => setBody(e.target.value)} />
      <Input placeholder="Deep link (e.g. /dpp)" value={link} onChange={(e) => setLink(e.target.value)} />
      <Button onClick={send} disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send Notification</Button>
    </Card>
  );
}

function FeedbackView() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin.php?action=feedback", { credentials: "include" })
      .then((r) => r.json()).then((d) => setItems(d.feedback ?? [])).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const resolve = async (id: string) => {
    await fetch("/api/admin.php?action=resolve_feedback", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ id, status: "resolved" }),
    });
    toast.success("Marked resolved"); load();
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!items.length) return <Card className="text-center text-sm text-muted-foreground">No feedback submitted yet.</Card>;

  return (
    <div className="space-y-3">
      {items.map((f) => (
        <Card key={String(f.id)} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>{String(f.user_name ?? "Anonymous")}</b>
              <Badge variant="secondary">{String(f.category)}</Badge>
              <span className="text-amber-500">{"★".repeat(Number(f.rating) || 0)}</span>
              {f.status === "resolved" ? <Badge className="bg-emerald-500/15 text-emerald-600">resolved</Badge> : <Badge className="bg-amber-500/15 text-amber-600">pending</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{String(f.message)}</p>
          </div>
          {f.status !== "resolved" && <Button size="sm" variant="outline" onClick={() => resolve(String(f.id))}><BadgeCheck className="h-4 w-4" /> Resolve</Button>}
        </Card>
      ))}
    </div>
  );
}

// ============ APP REPORT ============
function AppReport({ sub }: { sub: SubTab; goBack: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin.php?action=app_report", { credentials: "include" })
      .then((r) => r.json()).then(setData).catch(() => toast.error("Failed to load")).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (sub === "overview") return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Stat label="Total Users" value={data?.total_users ?? 0} icon={Users} />
      <Stat label="Total Revenue" value={`₹${data?.total_revenue ?? 0}`} icon={Wallet} accent="text-emerald-500" />
      <Stat label="Total Questions" value={data?.total_questions ?? 0} icon={BarChart3} />
      <Stat label="Daily DPPs" value={data?.total_dpps ?? 0} icon={Sparkles} />
      <Stat label="Mock Tests" value={data?.total_mocks ?? 0} icon={Activity} />
      <Stat label="Total Attempts" value={data?.total_attempts ?? 0} icon={TrendingUp} />
      <Stat label="Active Subscribers" value={data?.active_subscribers ?? 0} icon={BadgeCheck} accent="text-amber-500" />
    </div>
  );

  if (sub === "features") return (
    <div className="space-y-3">
      {(data?.features as Record<string, unknown>[] ?? []).sort((a, b) => Number(b.popularity_percent) - Number(a.popularity_percent)).map((f, i) => (
        <Card key={i} className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">#{i + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{String(f.name)}</div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${f.popularity_percent}%` }} />
            </div>
          </div>
          <div className="text-right">
            <div className="font-bold text-primary">{f.popularity_percent}%</div>
            <div className="text-xs text-muted-foreground">{Math.round(Number(f.usage_count))} uses</div>
          </div>
        </Card>
      ))}
    </div>
  );

  if (sub === "plans") return (
    <div className="space-y-3">
      {(data?.plans as Record<string, unknown>[] ?? []).map((p, i) => (
        <Card key={i} className="flex items-center gap-4">
          <Package className="h-8 w-8 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{String(p.plan)}</div>
            <div className="text-xs text-muted-foreground">₹{p.price} • {p.share} of sales</div>
          </div>
          <Badge className="bg-emerald-500/15 text-emerald-600">{p.purchases} sold</Badge>
        </Card>
      ))}
    </div>
  );
  return null;
}

// ============ APP MANAGEMENT ============
function AppManagement({ sub }: { sub: SubTab; goBack: () => void }) {
  const [banners, setBanners] = useState<Record<string, unknown>[]>([]);
  const [bTitle, setBTitle] = useState(""); const [bSub, setBSub] = useState(""); const [bLink, setBLink] = useState("/dpp");
  const [coupons, setCoupons] = useState<Record<string, unknown>[]>([]);
  const [cCode, setCCode] = useState(""); const [cPct, setCPct] = useState("20"); const [cMax, setCMax] = useState("100");
  const [gEmail, setGEmail] = useState(""); const [gDays, setGDays] = useState("365");
  const [batchTitle, setBatchTitle] = useState(""); const [batchPrice, setBatchPrice] = useState("1499"); const [batchTag, setBatchTag] = useState("High Yield NEET Program");
  const [rzpId, setRzpId] = useState(""); const [rzpSecret, setRzpSecret] = useState("");
  const [lovKey, setLovKey] = useState(""); const [gemKey, setGemKey] = useState("");
  const [dppQty, setDppQty] = useState("10");
  const [busy, setBusy] = useState(false);

  const post = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/admin.php?action=${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ action, ...payload }),
    });
    return res.json();
  }, []);

  useEffect(() => {
    if (sub === "banners") fetch("/api/admin.php?action=banners", { credentials: "include" }).then((r) => r.json()).then((d) => setBanners(d.banners ?? [])).catch(() => {});
    if (sub === "coupons") fetch("/api/admin.php?action=coupons", { credentials: "include" }).then((r) => r.json()).then((d) => setCoupons(d.coupons ?? [])).catch(() => {});
    if (sub === "razorpay" || sub === "ai-keys") fetch("/api/admin.php?action=get_settings", { credentials: "include" }).then((r) => r.json()).then((d) => {
      if (d.razorpay) { setRzpId(d.razorpay.key_id ?? ""); }
    }).catch(() => {});
  }, [sub]);

  const wrap = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  if (sub === "banners") return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="font-semibold"><Megaphone className="mr-1 inline h-4 w-4 text-primary" /> Create Banner</div>
        <Input placeholder="Title" value={bTitle} onChange={(e) => setBTitle(e.target.value)} />
        <Input placeholder="Subtitle" value={bSub} onChange={(e) => setBSub(e.target.value)} />
        <Input placeholder="CTA link (e.g. /dpp)" value={bLink} onChange={(e) => setBLink(e.target.value)} />
        <Button disabled={busy} onClick={() => wrap(async () => {
          const d = await post("save_banner", { title: bTitle || "NEET Daily Boost", subtitle: bSub, cta_link: bLink, active: 1 });
          d.success ? toast.success("Banner saved") : toast.error(d.error ?? "Failed");
          setBTitle(""); setBSub("");
        })}><Plus className="h-4 w-4" /> Save Banner</Button>
      </Card>
      {banners.map((b) => (
        <Card key={String(b.id)} className="flex items-center gap-3">
          <div className="flex-1"><b>{String(b.title)}</b> <span className="text-sm text-muted-foreground">{String(b.subtitle ?? "")}</span></div>
          <Button size="sm" variant="destructive" onClick={() => wrap(async () => { await post("delete_banner", { id: b.id }); setBanners((p) => p.filter((x) => x.id !== b.id)); toast.success("Banner removed"); })}><Trash2 className="h-4 w-4" /></Button>
        </Card>
      ))}
    </div>
  );

  if (sub === "grant") return (
    <Card className="max-w-xl space-y-3">
      <div className="font-semibold"><Star className="mr-1 inline h-4 w-4 text-amber-500" /> Grant Premium</div>
      <Input placeholder="user@email.com" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
      <Input placeholder="Duration in days" value={gDays} onChange={(e) => setGDays(e.target.value)} />
      <Button disabled={busy} onClick={() => wrap(async () => {
        const d = await post("grant_premium", { email: gEmail, tier: "prime", duration_days: Number(gDays) || 365 });
        d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
      })}>Grant Premium Access</Button>
    </Card>
  );

  if (sub === "coupons") return (
    <div className="space-y-4">
      <Card className="max-w-xl space-y-3">
        <div className="font-semibold"><Ticket className="mr-1 inline h-4 w-4 text-primary" /> Create Coupon</div>
        <Input placeholder="CODE (e.g. NEET50)" value={cCode} onChange={(e) => setCCode(e.target.value)} />
        <div className="flex gap-2">
          <Input placeholder="% off" value={cPct} onChange={(e) => setCPct(e.target.value)} />
          <Input placeholder="Max uses" value={cMax} onChange={(e) => setCMax(e.target.value)} />
        </div>
        <Button disabled={busy} onClick={() => wrap(async () => {
          const d = await post("coupons", { code: cCode, discount_percent: Number(cPct) || 20, max_uses: Number(cMax) || 100 });
          d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
          setCCode("");
        })}><Plus className="h-4 w-4" /> Create</Button>
      </Card>
      {coupons.map((c) => (
        <Card key={String(c.id)} className="flex items-center gap-3">
          <b className="font-mono text-primary">{String(c.code)}</b>
          <Badge variant="secondary">{String(c.discount_percent)}% off</Badge>
          <span className="text-xs text-muted-foreground">{c.used_count}/{c.max_uses} used</span>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={() => wrap(async () => {
            await post("delete_coupon", { id: c.id }); setCoupons((p) => p.filter((x) => x.id !== c.id)); toast.success("Coupon deleted");
          })}><Trash2 className="h-4 w-4" /></Button>
        </Card>
      ))}
    </div>
  );

  if (sub === "batches") return (
    <Card className="max-w-xl space-y-3">
      <div className="font-semibold"><Package className="mr-1 inline h-4 w-4 text-primary" /> Add / Update Batch</div>
      <Input placeholder="Batch title" value={batchTitle} onChange={(e) => setBatchTitle(e.target.value)} />
      <Input placeholder="Price (₹)" value={batchPrice} onChange={(e) => setBatchPrice(e.target.value)} />
      <Input placeholder="Tagline" value={batchTag} onChange={(e) => setBatchTag(e.target.value)} />
      <Button disabled={busy} onClick={() => wrap(async () => {
        const d = await post("batches", { title: batchTitle, price: Number(batchPrice) || 1499, discounted_price: Math.round((Number(batchPrice) || 1499) * 0.3), duration_days: 365, short_tagline: batchTag });
        d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
      })}>Save Batch</Button>
    </Card>
  );

  if (sub === "razorpay") return (
    <Card className="max-w-xl space-y-3">
      <div className="font-semibold"><Wallet className="mr-1 inline h-4 w-4 text-primary" /> Razorpay Configuration</div>
      <Input placeholder="rzp_live_xxxxx" value={rzpId} onChange={(e) => setRzpId(e.target.value)} />
      <Input placeholder="Key secret" type="password" value={rzpSecret} onChange={(e) => setRzpSecret(e.target.value)} />
      <Button disabled={busy} onClick={() => wrap(async () => {
        const d = await post("save_razorpay", { key_id: rzpId, key_secret: rzpSecret });
        d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
      })}>Save Keys</Button>
    </Card>
  );

  if (sub === "ai-keys") return (
    <Card className="max-w-xl space-y-3">
      <div className="font-semibold"><BrainCircuit className="mr-1 inline h-4 w-4 text-primary" /> AI API Keys</div>
      <Input placeholder="Lovable AI key" value={lovKey} onChange={(e) => setLovKey(e.target.value)} />
      <Input placeholder="Gemini API key" value={gemKey} onChange={(e) => setGemKey(e.target.value)} />
      <Button disabled={busy} onClick={() => wrap(async () => {
        const d = await post("save_ai_keys", { lovable_ai_key: lovKey, gemini_api_key: gemKey });
        d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
      })}>Save AI Keys</Button>
    </Card>
  );

  if (sub === "dpp-generator") return (
    <Card className="max-w-xl space-y-3">
      <div className="font-semibold"><Sparkles className="mr-1 inline h-4 w-4 text-primary" /> Bulk DPP Generator</div>
      <p className="text-sm text-muted-foreground">Creates high-yield 20-Q Daily DPPs. Numbers auto-increment from the latest existing DPP (e.g. existing Daily DPP 130 + 10 new → Daily DPP 131…140).</p>
      <Input placeholder="Quantity (1-100)" value={dppQty} onChange={(e) => setDppQty(e.target.value)} />
      <Button disabled={busy} onClick={() => wrap(async () => {
        const d = await post("generate_dpps", { quantity: Number(dppQty) || 10 });
        d.success ? toast.success(d.message) : toast.error(d.error ?? "Failed");
      })}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate DPPs</Button>
    </Card>
  );

  return null;
}
