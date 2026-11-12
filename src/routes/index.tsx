import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight, Trophy, BookOpen, Brain, Target, Layers, Highlighter,
  Route as RouteIcon, BarChart3, Infinity as InfinityIcon, Sparkles, Monitor, Zap, ShieldCheck, Star,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { listFeaturedSelections } from "@/lib/selections.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neet Buddy — AI-powered NEET prep" },
      { name: "description", content: "Daily DPP, AI-built quizzes, full-length NEET mocks in a real CBT interface, flashcards and deep analytics — everything a NEET aspirant needs in one app." },
      { property: "og:title", content: "Neet Buddy — AI-powered NEET prep" },
      { property: "og:description", content: "Daily practice, AI quizzes and real exam-day CBT mocks. Crack NEET, smarter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

const FEATURES: { icon: typeof BookOpen; label: string; desc: string }[] = [
  { icon: BookOpen, label: "Daily DPP", desc: "Fresh practice set every morning — free, forever." },
  { icon: Brain, label: "AI quizzes", desc: "Custom tests built around your weak chapters." },
  { icon: Target, label: "Full NEET mocks", desc: "Exam-day pattern with +4/−1 marking and timers." },
  { icon: Layers, label: "Flashcards", desc: "High-yield revision you can finish in minutes." },
  { icon: Highlighter, label: "NCERT highlights", desc: "The most-repeated lines, distilled for revision." },
  { icon: RouteIcon, label: "AI study path", desc: "A 7-day plan that adapts to your performance." },
  { icon: Trophy, label: "Live contests", desc: "Daily and weekly contests with real prizes." },
  { icon: BarChart3, label: "Deep analytics", desc: "Subject-wise accuracy, timing and weak areas." },
  { icon: InfinityIcon, label: "Infinite Run", desc: "Endless adaptive practice that scales to your level." },
  { icon: Sparkles, label: "Score predictor", desc: "AI forecasts your marks and rank band." },
];

const HIGHLIGHTS = [
  { icon: Zap, text: "1v1 Battlegrounds — real-time duels" },
  { icon: Monitor, text: "True NEET CBT exam interface" },
  { icon: ShieldCheck, text: "Anti-cheat timers & fair play" },
];

function LandingPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && user) nav({ to: "/dashboard", replace: true });
  }, [user, loading, nav]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-10" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-40 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3 w-3" /> Built for NEET-UG aspirants
          </div>
          <div className="mt-5 flex items-center gap-3">
            <img
              src="/icons/icon-192.png"
              alt="Neet Buddy"
              className="h-14 w-14 rounded-2xl shadow-elegant"
            />
            <div className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Neet <span className="text-gradient-primary">Buddy</span>
            </div>
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Crack NEET,
            <br />
            <span className="text-gradient-primary">smarter.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm text-muted-foreground sm:text-lg">
            Daily practice. AI-built quizzes. Real analytics. Everything you need to go from
            preparing to <span className="font-semibold text-foreground">selected</span> — in one app.
          </p>
          <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" className="h-12 w-full bg-gradient-primary px-8 text-base shadow-elegant hover:opacity-95 sm:w-auto">
              <Link to="/login">Start free <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 w-full px-8 sm:w-auto">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
          <div className="mt-4 text-[11px] font-medium text-muted-foreground">
            Free daily DPP · No credit card needed
          </div>

          {/* Highlight chips */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {HIGHLIGHTS.map((h) => (
              <div key={h.text} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-soft">
                <h.icon className="h-3.5 w-3.5 text-primary" />
                {h.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RESULTS */}
      <SelectionsShowcase />

      {/* FEATURES */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Everything you need</div>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">One app. Full NEET prep.</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Stop juggling five apps and a stack of PDFs — every tool talks to the same analytics.
          </p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="group rounded-2xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elegant"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                <f.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="mt-3 text-sm font-bold">{f.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CBT MODE */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/5 p-6 shadow-soft sm:p-10">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
              <Monitor className="h-3.5 w-3.5" /> Real NEET CBT Mode
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Practice exactly like exam day
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              Every quiz, DPP, mock &amp; battle runs in a true NEET computer-based-test interface — the
              same layout, timer and marking scheme you'll see on the real screen. No surprises in May.
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

      {/* FINAL CTA */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 text-center shadow-elegant sm:p-10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-[0.06]" />
          <div className="relative">
            <div className="flex justify-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Your rank starts with today's practice.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Join thousands of aspirants building their NEET score one day at a time.
            </p>
            <Button asChild size="lg" className="mt-6 h-12 bg-gradient-primary px-8 text-base shadow-elegant hover:opacity-95">
              <Link to="/login">Get started — it's free <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
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
              <div key={s.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-transform hover:-translate-y-0.5">
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
