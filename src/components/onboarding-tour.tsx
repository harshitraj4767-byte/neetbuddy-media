import { useCallback, useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, X, Hand, MonitorPlay, CalendarDays, Wand2, Layers, BookOpen,
  Compass, Target, Brain, FileQuestion, Trophy, Swords, BarChart3, RefreshCw,
  BookmarkCheck, Users, Gift, Crown, LifeBuoy, Sparkles, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const DR_VANSHU_IMG = "/mascot/dr-vanshu.png";
export const TOUR_EVENT = "neetbuddy:start-tour";

/** Start (or restart) the guided tour from anywhere in the app. */
export function startAppTour() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

type Step = {
  route: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const STEPS: Step[] = [
  {
    route: "/dashboard",
    title: "Hi, I'm Dr. Vanshu",
    body:
      "I'll walk you through Neet Buddy in under a minute. The app stays fully interactive during the tour — tap anything as we go, or skip whenever you like.",
    icon: Hand,
  },
  {
    route: "/dashboard",
    title: "Your dashboard",
    body:
      "Today's progress, streak, weekly performance and personalised recommendations — everything you need to decide what to study next, in one screen.",
    icon: Compass,
  },
  {
    route: "/dashboard",
    title: "True NEET CBT mode",
    body:
      "Every quiz, DPP, mock and battle runs in the real exam interface: +4 / −1 marking, per-question timer, question palette, bookmark & review, subject-locked ordering and auto-submit at time-up.",
    icon: MonitorPlay,
  },
  {
    route: "/daily",
    title: "Daily DPP",
    body: "A fresh, AI-generated daily practice set every morning — free forever, and it keeps your streak alive.",
    icon: CalendarDays,
  },
  {
    route: "/generate",
    title: "Custom test generator",
    body: "Choose subject, chapters, difficulty and length. A tailored test is built for you in seconds.",
    icon: Wand2,
  },
  {
    route: "/quiz",
    title: "Practice by chapter",
    body: "Chapter-wise question banks across Physics, Chemistry and Biology with instant solutions and explanations.",
    icon: BookOpen,
  },
  {
    route: "/pyqs",
    title: "Previous year questions",
    body: "Tagged NEET PYQs by chapter and year, with year-wise accuracy tracking so you know what repeats.",
    icon: FileQuestion,
  },
  {
    route: "/mocks",
    title: "Full-length mocks",
    body: "180-question NEET pattern mocks with timers, negative marking, ranks and deep post-test analysis.",
    icon: Brain,
  },
  {
    route: "/flashcards",
    title: "Flashcards",
    body: "High-yield cards you flip and self-rate Easy / Medium / Hard — spaced revision that fits between sessions.",
    icon: Layers,
  },
  {
    route: "/study-essentials",
    title: "Study essentials",
    body: "Mind maps, formula sheets, short notes and NCERT highlights — the most-repeated lines condensed for revision.",
    icon: BookOpen,
  },
  {
    route: "/neetlab",
    title: "NEET Lab",
    body: "Interactive 3D simulations and visual experiments that make tough concepts click.",
    icon: Sparkles,
  },
  {
    route: "/ai-path",
    title: "AI Path & AI Tutor",
    body: "A 7-day plan generated from your own performance, plus an AI tutor for instant doubt-solving and explanations.",
    icon: Compass,
  },
  {
    route: "/score-predictor",
    title: "Score predictor",
    body: "Forecast your NEET marks and rank band from real attempt data, with targeted tips to push higher.",
    icon: Target,
  },
  {
    route: "/improvement",
    title: "Improvement zone",
    body: "Weak chapters surfaced automatically, so revision always starts where it matters most.",
    icon: RefreshCw,
  },
  {
    route: "/mistakes",
    title: "Mistakes & bookmarks",
    body: "Every wrong answer and saved question collected in one place for focused re-attempts.",
    icon: BookmarkCheck,
  },
  {
    route: "/analytics",
    title: "Analytics & reports",
    body: "Subject-wise accuracy, time per question, trends over weeks and a shareable progress report.",
    icon: BarChart3,
  },
  {
    route: "/battlegrounds",
    title: "Battlegrounds",
    body: "Challenge another aspirant to a live 1v1 question duel — fast, timed and ranked.",
    icon: Swords,
  },
  {
    route: "/contests",
    title: "Contests & leaderboard",
    body: "Free daily and paid weekly contests with real prizes, plus weekly and all-time leaderboards.",
    icon: Trophy,
  },
  {
    route: "/community",
    title: "Community & mentorship",
    body: "Join our WhatsApp and Telegram channels, or get a 1-on-1 mentor to plan your months ahead.",
    icon: Users,
  },
  {
    route: "/referrals",
    title: "Refer & earn",
    body: "Share your code — when a friend joins and buys a batch, you earn real cash withdrawable to your bank.",
    icon: Gift,
  },
  {
    route: "/subscription",
    title: "Premium",
    body: "Unlimited AI tests, every paid mock and full access to all premium study tools.",
    icon: Crown,
  },
  {
    route: "/dashboard",
    title: "You're all set",
    body:
      "Need anything? Tap the floating support button any time — or reopen this tour from your profile. Good luck, doctor.",
    icon: LifeBuoy,
  },
];

const LS_KEY = "neetiq_tour_done_v1";

export function OnboardingTour() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Decide whether to auto-start the tour
  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY) === "1") return;
    if (path.startsWith("/login") || path.startsWith("/admin")) return;
    setOpen(true);
  }, [user, loading, path]);

  // Manual restart from anywhere
  const restart = useCallback(() => {
    setIdx(0);
    setOpen(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(TOUR_EVENT, restart);
    return () => window.removeEventListener(TOUR_EVENT, restart);
  }, [restart]);

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
  const StepIcon = step.icon;
  const pct = Math.round(((idx + 1) / STEPS.length) * 100);

  return (
    <>
      {/* No backdrop — the app stays fully interactive so users can explore
          each feature during the tour. */}
      <div className="fixed inset-x-3 bottom-3 z-[101] mx-auto max-w-md sm:bottom-6 sm:right-6 sm:left-auto">
        {/* Dr. Vanshu sits on the edge of the card */}
        <img
          src={DR_VANSHU_IMG}
          alt="Dr. Vanshu, your Neet Buddy guide"
          className="pointer-events-none relative z-10 -mb-6 ml-1 h-24 w-24 select-none object-contain drop-shadow-lg sm:h-28 sm:w-28"
        />
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
          <div className="flex items-center gap-2 bg-gradient-primary px-4 py-3 text-primary-foreground">
            <StepIcon className="h-4 w-4" strokeWidth={2} />
            <div className="text-xs font-semibold uppercase tracking-widest">
              Tour with Dr. Vanshu · {idx + 1}/{STEPS.length}
            </div>
            <button
              className="ml-auto rounded-md p-1 transition hover:bg-white/15"
              onClick={() => dismiss(true)}
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="h-1 w-full bg-muted">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="space-y-2 p-5">
            <div className="text-lg font-bold leading-tight">{step.title}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
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
