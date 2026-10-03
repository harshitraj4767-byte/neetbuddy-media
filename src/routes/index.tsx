import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAppShell } from "@/lib/app-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neet Buddy — Meet Dr. Catalyst, your NEET partner" },
      { name: "description", content: "Hey buddy! Dr. Catalyst is your NEET partner. Log in or sign up and let's crack NEET together." },
      { property: "og:title", content: "Neet Buddy — Meet Dr. Catalyst" },
      { property: "og:description", content: "Your NEET partner is waiting. Log in or sign up and let's crack NEET together." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const LINES = ["Hey buddy! 👋", "I'm your NEET Buddy, Dr. Catalyst.", "Let's crack NEET together!"];

function useTyping(lines: string[]) {
  const [out, setOut] = useState<string[]>([""]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let li = 0, ci = 0, t: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (li >= lines.length) { setDone(true); return; }
      const line = Array.from(lines[li]);
      if (ci <= line.length) {
        const partial = line.slice(0, ci).join("");
        setOut((prev) => { const n = [...prev]; n[li] = partial; return n; });
        ci++;
        t = setTimeout(tick, 45);
      } else {
        li++; ci = 0;
        if (li < lines.length) setOut((prev) => [...prev, ""]);
        t = setTimeout(tick, 380);
      }
    };
    t = setTimeout(tick, 900);
    return () => clearTimeout(t);
  }, [lines]);
  return { out, done };
}

function LandingPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [appShell, setAppShell] = useState(false);
  useEffect(() => { setAppShell(isAppShell()); }, []);
  useEffect(() => {
    if (loading) return;
    if (user) { nav({ to: "/dashboard", replace: true }); return; }
    if (appShell) nav({ to: "/login", replace: true });
  }, [user, loading, appShell, nav]);

  const { out, done } = useTyping(LINES);

  if (appShell) return <div className="min-h-screen bg-background" />;

  return (
    <main className="nbx-stage">
      <div className="nbx-orb nbx-orb-a" />
      <div className="nbx-orb nbx-orb-b" />
      <div className="nbx-grid" />

      <header className="nbx-top">
        <span className="nbx-brand">neet<b>buddy</b></span>
        <span className="nbx-tag">NEET · 2027</span>
      </header>

      <section className="nbx-center">
        <div className="nbx-bubble" aria-live="polite">
          {out.map((l, i) => (
            <p key={i} className={i === 0 ? "nbx-hey" : ""}>
              {l}
              {i === out.length - 1 && !done && <span className="nbx-caret" />}
            </p>
          ))}
          <span className="nbx-dot nbx-dot-1" />
          <span className="nbx-dot nbx-dot-2" />
        </div>

        <div className="nbx-mascot-wrap">
          <div className="nbx-halo" />
          <img
            src="/catalyst/dr-catalyst-waving.webp?v=catalyst_v2"
            alt="Dr. Catalyst waving hello"
            className="nbx-mascot"
          />
        </div>

        <div className={`nbx-actions ${done ? "is-on" : ""}`}>
          <Link to="/login" search={{ tab: "signup" } as never} className="nbx-btn nbx-btn-main">
            <UserPlus className="h-5 w-5" /> Sign up — it's free
          </Link>
          <Link to="/login" className="nbx-btn nbx-btn-ghost">
            <LogIn className="h-5 w-5" /> I already have an account
          </Link>
        </div>
      </section>

      <footer className="nbx-foot">© {new Date().getFullYear()} Neet Buddy</footer>
    </main>
  );
}
