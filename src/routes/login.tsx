import { publicMediaAsset } from "@/lib/media-assets";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  BarChart3,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { signInWithPassword, signUpWithPassword } from "@/lib/auth-bridge";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — Neet Buddy" }, { name: "description", content: "Sign up or log in to Neet Buddy." }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user, loading, refresh, applySession } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) {
      const code = r.toUpperCase();
      setRefCode(code); setTab("signup");
      // Persist so Google OAuth or email-confirm round-trips still credit later.
      try { localStorage.setItem("pending_ref_code", code); } catch { /* noop */ }
    }
  }, []);

  useEffect(() => { if (!loading && user) nav({ to: "/dashboard", replace: true }); }, [user, loading, nav]);
  useEffect(() => { setReady(true); }, []);

  const fieldValue = (form: HTMLFormElement, id: string, fallback: string) => {
    const el = form.querySelector<HTMLInputElement>(`#${id}`);
    return el && el.value !== "" ? el.value : fallback;
  };

  const onLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    // Read live field values from the DOM — React state can lag at hydration.
    const em = fieldValue(e.currentTarget, "le", email);
    const pw = fieldValue(e.currentTarget, "lp", password);
    try {
      const res = await signInWithPassword({ data: { email: em, password: pw } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applySession(res.session);
      try {
        const pending = localStorage.getItem("pending_ref_code");
        if (pending) {
          const { applyReferralCode } = await import("@/lib/referrals.functions");
          await applyReferralCode({ data: { code: pending } }).catch(() => {});
          localStorage.removeItem("pending_ref_code");
        }
      } catch { /* noop */ }
      void refresh();
      toast.success("Welcome back!");
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Log in failed");
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    const em = fieldValue(e.currentTarget, "se", email);
    const pw = fieldValue(e.currentTarget, "sp", password);
    const nm = fieldValue(e.currentTarget, "sn", name);
    if (refCode.trim()) {
      try { localStorage.setItem("pending_ref_code", refCode.trim().toUpperCase()); } catch { /* noop */ }
    }
    try {
      const res = await signUpWithPassword({ data: { email: em, password: pw, fullName: nm } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applySession(res.session);
      void refresh();
      toast.success("Account created!");
      nav({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  };

  const passwordToggle = (id: string) => (
    <button
      type="button"
      aria-label={showPassword ? "Hide password" : "Show password"}
      onClick={() => setShowPassword((value) => !value)}
      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      <span className="sr-only">{id}</span>
    </button>
  );

  return (
    <main className="auth-page relative min-h-screen overflow-hidden bg-background">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-10">
        <section className="auth-spotlight hidden min-h-[620px] flex-col justify-between rounded-[2rem] p-8 text-white shadow-2xl lg:flex xl:p-12">
          <div>
            <Link to="/" className="inline-flex items-center gap-3">
              <img src={publicMediaAsset("icons/icon-192.png")} alt="Neet Buddy" className="h-11 w-11 rounded-2xl bg-white/10 p-1 shadow-lg" />
              <span className="text-xl font-bold tracking-tight">Neet <span className="text-cyan-200">Buddy</span></span>
            </Link>
            <div className="mt-24 max-w-lg">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" /> Your prep, organised
              </div>
              <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.04em] xl:text-6xl">
                Make every study session count.
              </h1>
              <p className="mt-6 max-w-md text-base leading-7 text-blue-100/80">
                Practice smarter, see your progress clearly, and build the consistency that gets you closer to your NEET score.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Target, label: "Focused practice" },
              { icon: BarChart3, label: "Clear insights" },
              { icon: ShieldCheck, label: "Private by design" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
                <Icon className="h-4 w-4 text-cyan-200" />
                <div className="mt-2 text-xs font-semibold text-white/90">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-7 flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <img src={publicMediaAsset("icons/icon-192.png")} alt="Neet Buddy" className="h-10 w-10 rounded-xl shadow-glow" />
              <span className="text-lg font-bold">Neet <span className="text-gradient-primary">Buddy</span></span>
            </Link>
            <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground">Home</Link>
          </div>

          <div className="auth-card rounded-[1.75rem] border border-border/80 bg-card/90 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                {tab === "login" ? <LockKeyhole className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{tab === "login" ? "Welcome back" : "Create your account"}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {tab === "login" ? "Continue your preparation from where you left off." : "Start your personalised NEET preparation journey for free."}
              </p>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-secondary/80 p-1">
                <TabsTrigger value="login" className="rounded-lg text-sm">Log in</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg text-sm">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form className="space-y-4" onSubmit={onLogin}>
                  <div className="space-y-2">
                    <Label htmlFor="le">Email address</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="le" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="you@example.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><Label htmlFor="lp">Password</Label><span className="text-[11px] text-muted-foreground">Minimum 6 characters</span></div>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="lp" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl pl-10 pr-11" placeholder="Enter your password" />
                      {passwordToggle("password visibility")}
                    </div>
                  </div>
                  <Button type="submit" disabled={busy || !ready} className="h-11 w-full rounded-xl bg-gradient-primary font-semibold shadow-elegant hover:opacity-95">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Log in <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form className="space-y-4" onSubmit={onSignup}>
                  <div className="space-y-2">
                    <Label htmlFor="sn">Full name</Label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="sn" required value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="Your full name" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="se">Email address</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="se" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="you@example.com" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp">Password</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="sp" type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl pl-10 pr-11" placeholder="Create a password" />
                      {passwordToggle("password visibility")}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rc">Referral code <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="rc" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="FRIEND'S CODE" maxLength={20} className="h-11 rounded-xl" />
                  </div>
                  <Button type="submit" disabled={busy || !ready} className="h-11 w-full rounded-xl bg-gradient-primary font-semibold shadow-elegant hover:opacity-95">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>
                  <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-[11px] leading-5 text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    Your account works on the static Hostinger build and the full app runtime.
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure session · Your data stays private
          </div>
          <Button asChild variant="ghost" className="mx-auto mt-3 flex">
            <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Back to home</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}

