import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in — Neet Buddy" }, { name: "description", content: "Sign up or log in to Neet Buddy." }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);

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

  useEffect(() => { if (!loading && user) nav({ to: "/dashboard" }); }, [user, loading, nav]);

  const onGoogle = async () => {
    setOauthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setOauthBusy(false);
      toast.error(error.message || "Google sign-in failed");
    }
  };

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      // Banned/suspended → fetch the admin-set reason so the user sees
      // exactly why instead of a generic "User banned" string.
      if (/ban|suspend|disabl/i.test(error.message)) {
        try {
          const { getSuspensionReasonByEmail } = await import("@/lib/auth-status.functions");
          const info = await getSuspensionReasonByEmail({ data: { email } });
          if (info && (info as any).suspended) {
            const reason = (info as any).reason as string | null;
            toast.error(
              reason
                ? `Account suspended: ${reason}`
                : "Your account has been suspended. Contact support if you think this is a mistake.",
              { duration: 10000 },
            );
            return;
          }
        } catch { /* fall through to generic */ }
      }
      const msg = /confirm|verif/i.test(error.message)
        ? "Please verify your email first. Check your inbox for the confirmation link."
        : error.message;
      return toast.error(msg);
    }
    // Apply any pending referral code captured during signup.
    try {
      const pending = localStorage.getItem("pending_ref_code");
      if (pending) {
        const { applyReferralCode } = await import("@/lib/referrals.functions");
        await applyReferralCode({ data: { code: pending } }).catch(() => {});
        localStorage.removeItem("pending_ref_code");
      }
    } catch { /* noop */ }
    setBusy(false);
    toast.success("Welcome back!");
    nav({ to: "/dashboard" });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    // Stash referral BEFORE signup so SIGNED_IN listener can apply it
    // immediately if auto-confirm is enabled.
    if (refCode.trim()) {
      try { localStorage.setItem("pending_ref_code", refCode.trim().toUpperCase()); } catch { /* noop */ }
    }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { full_name: name } },
    });
    if (error) { setBusy(false); return toast.error(error.message); }

    // If Supabase returned a session (email confirmations disabled at project level),
    // proceed straight to dashboard. Otherwise, ask the user to verify by email.
    if (data.session) {
      setBusy(false);
      toast.success("Account created!");
      nav({ to: "/dashboard" });
      return;
    }
    setBusy(false);
    toast.success("Check your email to verify your account before logging in.", { duration: 8000 });
    setTab("login");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-[0.07]" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-10">
        <Link to="/" className="mb-7 flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="Neet Buddy" className="h-10 w-10 rounded-xl shadow-glow" />
          <span className="text-lg font-bold">Neet <span className="text-gradient-primary">Buddy</span></span>
        </Link>

        <div className="w-full rounded-3xl border border-border bg-card p-6 shadow-elegant animate-fade-in-up">
          <div className="mb-1 text-center">
            <h1 className="text-xl font-bold tracking-tight">{tab === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{tab === "login" ? "Log in to continue your prep." : "Free to start. No credit card."}</p>
          </div>

          <div className="my-4 space-y-2">
            <Button type="button" variant="outline" className="w-full" onClick={onGoogle} disabled={oauthBusy}>
              {oauthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7z"/><path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5.1l-6.1-5c-2 1.4-4.4 2.2-7.1 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.7 39.1 16.2 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.1 5c-.4.4 6.7-4.9 6.7-14.4 0-1.2-.1-2.3-.4-3.5z"/></svg>
                Continue with Google
              </>}
            </Button>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground"><Mail className="h-3 w-3" /> or email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-5">
              <form className="space-y-3" onSubmit={onLogin}>
                <div className="space-y-1.5">
                  <Label htmlFor="le">Email</Label>
                  <Input id="le" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lp">Password</Label>
                  <Input id="lp" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-elegant hover:opacity-95">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-5">
              <form className="space-y-3" onSubmit={onSignup}>
                <div className="space-y-1.5">
                  <Label htmlFor="sn">Full name</Label>
                  <Input id="sn" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="se">Email</Label>
                  <Input id="se" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sp">Password</Label>
                  <Input id="sp" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rc">Referral code <span className="text-muted-foreground">(optional, +10 bonus)</span></Label>
                  <Input id="rc" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="FRIEND'S CODE" maxLength={20} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-elegant hover:opacity-95">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">By signing up you agree to our terms & privacy policy.</p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <Button asChild variant="ghost" className="mt-5">
          <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
