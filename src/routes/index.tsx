import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight, Trophy, BookOpen, Brain, Target, Layers, Highlighter,
  Route as RouteIcon, BarChart3, Infinity as InfinityIcon, Sparkles, Download,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { listFeaturedSelections } from "@/lib/selections.functions";
import { isAppShell } from "@/lib/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neet Buddy — AI-powered NEET prep" },
      { name: "description", content: "Study Hub Pro is a comprehensive learning platform for students, offering quizzes, study materials, and subject-specific content." },
      { property: "og:title", content: "Neet Buddy — AI-powered NEET prep" },
      { property: "og:description", content: "Study Hub Pro is a comprehensive learning platform for students, offering quizzes, study materials, and subject-specific content." },
    ],
  }),
  component: LandingPage,
});

const FEATURES: { icon: typeof BookOpen; label: string }[] = [
  { icon: BookOpen, label: "Daily DPP" },
  { icon: Brain, label: "AI quizzes" },
  { icon: Target, label: "Full NEET mocks" },
  { icon: Layers, label: "Flashcards" },
  { icon: Highlighter, label: "NCERT highlights" },
  { icon: RouteIcon, label: "AI study path" },
  { icon: Target, label: "Score predictor" },
  { icon: Trophy, label: "Live contests" },
  { icon: InfinityIcon, label: "Infinite Run" },
  { icon: BarChart3, label: "Deep analytics" },
];

function LandingPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [installEvt, setInstallEvt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  // Inside the installed app there is no landing page: signed-in users land on
  // the dashboard, everyone else goes straight to login. The web build keeps it.
  const [appShell, setAppShell] = useState(false);
  useEffect(() => { setAppShell(isAppShell()); }, []);
  useEffect(() => {
    if (loading) return;
    if (user) { nav({ to: "/dashboard", replace: true }); return; }
    if (appShell) nav({ to: "/login", replace: true });
  }, [user, loading, appShell, nav]);

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h as any);
    return () => window.removeEventListener("beforeinstallprompt", h as any);
  }, []);

  async function onDownloadApp() {
    if (installEvt?.prompt) {
      try {
        installEvt.prompt();
        await installEvt.userChoice;
        setInstallEvt(null);
        return;
      } catch { /* fall through */ }
    }
    setShowInstall(true);
  }

  if (appShell) {
    // App shell: render nothing while the redirect above runs.
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-[0.05]" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:py-28">
          <img
            src="/icons/icon-192.png"
            alt="Neet Buddy"
            className="h-16 w-16 rounded-2xl shadow-elegant"
          />
          <div className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Neet <span className="text-gradient-primary">Buddy</span>
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Crack NEET, <span className="text-gradient-primary">smarter.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-muted-foreground sm:text-base">
            Daily practice. AI-built quizzes. Real analytics.
          </p>
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="w-full bg-gradient-primary shadow-elegant hover:opacity-95 sm:w-auto">
              <Link to="/login">Sign up <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link to="/login">Log in</Link>
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              onClick={onDownloadApp}
              className="w-full sm:w-auto"
            >
              <Download className="mr-1 h-4 w-4" /> Download app
            </Button>
          </div>
        </div>
      </section>

      <InstallInstructionsDialog open={showInstall} onOpenChange={setShowInstall} />

      {/* RESULTS */}
      <SelectionsShowcase />

      {/* FEATURES — concise chips */}
      <section className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Everything you need</div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">One app. Full NEET prep.</h2>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium shadow-soft"
            >
              <f.icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CBT MODE */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 p-6 shadow-soft sm:p-10">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Real NEET CBT Mode
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Practice exactly like exam day
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Every quiz, DPP, mock & battle runs in a true NEET computer-based-test interface — the
              same layout, timer and marking scheme you'll see on the real screen.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { t: "180 Qs · 200 mins", d: "45 Physics · 45 Chemistry · 90 Biology (Bot + Zoo)." },
              { t: "+4 / −1 marking", d: "Standard NEET marking with per-subject scoring." },
              { t: "Palette navigation", d: "Answered · Not-answered · Marked-for-review · Not-visited." },
              { t: "Per-question timer", d: "Deadline persists on refresh — no cheating the clock." },
              { t: "Subject-locked order", d: "Mocks enforce Physics → Chemistry → Biology sequence." },
              { t: "Auto-submit at time-up", d: "Answers lock instantly and full analytics appear." },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="text-sm font-bold">{f.t}</div>
                <div className="mt-1 text-xs text-muted-foreground">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* MINIMAL FOOTER */}
      <footer className="mt-auto border-t border-border/60 py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Neet Buddy. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function SelectionsShowcase() {
  const list = useServerFn(listFeaturedSelections);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { list().then((r: any) => setRows(r ?? [])).catch(() => setRows([])); }, [list]);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Our results</div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Real students. Real selections.</h2>
      </div>
      {rows === null ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              <div className="aspect-video w-full animate-pulse bg-muted" />
              <div className="p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Sparkles className="h-8 w-8 text-primary/70" />
          <div className="text-base font-semibold">Selection stories coming soon</div>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, 6).map((s) => {
            const cover = s.media?.find((m: any) => m.type === "image") ?? s.media?.[0];
            return (
              <div key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {cover && (
                  cover.type === "image"
                    ? <img src={cover.url} alt={s.student_name} className="aspect-video w-full object-cover" />
                    : <video src={cover.url} className="aspect-video w-full object-cover" muted playsInline controls />
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <div className="text-base font-bold">{s.student_name}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[s.rank_text, s.college, s.exam_year].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function InstallInstructionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Install Neet Buddy</DialogTitle>
          <DialogDescription>Add the app to your home screen for a full-screen experience.</DialogDescription>
        </DialogHeader>
        {isIOS ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Tap the <b>Share</b> button in Safari.</li>
            <li>Scroll and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> — the icon appears on your home screen.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>Tap the <b>⋮</b> menu in Chrome (top-right).</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
            <li>Confirm — the Neet Buddy icon will appear on your device.</li>
          </ol>
        )}
        <div className="text-xs text-muted-foreground">
          Tip: on Chrome for Android you can also open <code>chrome://settings</code> → <b>Add to home screen</b>.
        </div>
      </DialogContent>
    </Dialog>
  );
}

