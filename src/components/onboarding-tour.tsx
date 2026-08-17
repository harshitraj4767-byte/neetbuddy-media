import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type Step = {
  route: string;
  title: string;
  body: string;
  highlight?: string; // CSS selector to spotlight (optional)
};

const STEPS: Step[] = [
  { route: "/dashboard", title: "Welcome to Neet Buddy 👋", body: "Quick tour of every feature. The app stays fully interactive — tap around and explore as we go. Skip anytime." },
  {
    route: "/dashboard",
    title: "CBT Mode — the real NEET feel 🖥️",
    body:
      "Every quiz, DPP, mock and battle runs in true NEET CBT mode: 180 questions across Physics, Chemistry & Biology, +4 / −1 marking, per-question timer, palette navigation, bookmark & review, subject-locked ordering (Phy → Chem → Bio in mocks) and auto-submit at time-up — the exact interface you'll get on exam day.",
  },
  { route: "/daily", title: "Daily DPP", body: "A fresh AI-generated Daily Practice Problem set every morning. Free, forever." },
  { route: "/generate", title: "Generate a test", body: "Pick subject, chapters and difficulty. AI builds you a custom test in seconds." },
  { route: "/flashcards", title: "Flashcards 🧠", body: "Flip through high-yield cards, reveal the answer, then rate yourself Easy / Medium / Hard. Open a deck to try it now." },
  { route: "/ncert-highlights", title: "NCERT Highlights ✨", body: "The most-repeated NCERT lines that show up in NEET. Quick, exam-focused revision." },
  { route: "/ai-path", title: "AI Path 🧭", body: "A personalized 7-day study plan generated from your performance — knows exactly what to fix next." },
  { route: "/score-predictor", title: "Score Predictor 🎯", body: "AI forecasts your NEET marks and rank band from your attempts, with tips to push higher." },
  { route: "/mocks", title: "Mock tests", body: "Full-length NEET pattern mocks with timers, negative marking and detailed analysis." },
  { route: "/pyqs", title: "Previous Year Questions", body: "Browse and practice tagged PYQs across every chapter." },
  { route: "/contests", title: "Live contests", body: "Compete with everyone for real prize money. Free daily + paid weekly contests." },
  { route: "/leaderboard", title: "Leaderboard 🏆", body: "See where you rank among all aspirants — weekly and all-time. Climb it by keeping your streak and winning contests." },
  { route: "/analytics", title: "Progress & analytics", body: "Subject-wise accuracy, time per question, weak chapters and your weekly progress report." },
  { route: "/referrals", title: "Refer & earn 💸", body: "Share your code — when a friend joins and buys any batch, you earn real cash (₹300–₹1,000 per referral). Withdraw straight to your bank." },

  { route: "/subscription", title: "Premium 👑", body: "Unlock unlimited AI tests, every paid mock and free access to all premium study tools." },
  { route: "/dashboard", title: "Need help? 🛟", body: "Tap the floating support button bottom-right anytime. You're all set — go explore! 🚀" },
];

const LS_KEY = "neetiq_tour_done_v1";

export function OnboardingTour() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Decide whether to start the tour
  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY) === "1") return;
    // Don't auto-open on login or admin screens
    if (path.startsWith("/login") || path.startsWith("/admin")) return;
    setOpen(true);
  }, [user, loading, path]);

  // Navigate to each step's route as we advance
  useEffect(() => {
    if (!open) return;
    const step = STEPS[idx];
    if (step && path !== step.route) {
      nav({ to: step.route });
    }
  }, [idx, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss(markDone: boolean) {
    setOpen(false);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, "1");
    if (markDone && user) {
      (supabase.from("profiles") as unknown as {
        update: (v: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<unknown> };
      })
        .update({ onboarding_completed: true })
        .eq("id", user.id)
        .then(() => {}, () => {});
    }
  }

  if (!open) return null;
  const step = STEPS[idx];
  const isLast = idx === STEPS.length - 1;

  return (
    <>
      {/* No backdrop — the app stays fully interactive so users can explore
          each feature during the tour. */}
      {/* Tour card */}
      <div className="fixed inset-x-3 bottom-3 z-[101] mx-auto max-w-md sm:bottom-6 sm:right-6 sm:left-auto">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
          <div className="flex items-center gap-2 bg-gradient-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="h-4 w-4" />
            <div className="text-xs font-semibold uppercase tracking-widest">
              Live tour · {idx + 1}/{STEPS.length}
            </div>
            <button
              className="ml-auto rounded-md p-1 transition hover:bg-white/15"
              onClick={() => dismiss(true)}
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 p-5">
            <div className="text-lg font-bold leading-tight">{step.title}</div>
            <p className="text-sm text-muted-foreground">{step.body}</p>
            <div className="flex items-center justify-between pt-3">
              <button
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => dismiss(true)}
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                {idx > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setIdx((i) => i - 1)}>
                    Back
                  </Button>
                )}
                {isLast ? (
                  <Button size="sm" className="bg-gradient-primary" onClick={() => dismiss(true)}>
                    Done
                  </Button>
                ) : (
                  <Button size="sm" className="bg-gradient-primary" onClick={() => setIdx((i) => i + 1)}>
                    Next <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}