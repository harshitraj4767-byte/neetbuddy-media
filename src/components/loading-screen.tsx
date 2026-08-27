import { mascot, type MascotMood } from "@/lib/mascot";
import { cn } from "@/lib/utils";

export type LoadingVariant =
  | "quiz"
  | "contest"
  | "battle"
  | "result"
  | "leaderboard"
  | "analysis"
  | "profile"
  | "default";

const MOODS: Record<LoadingVariant, MascotMood> = {
  quiz: "thinking",
  contest: "confident",
  battle: "confident",
  result: "working",
  leaderboard: "confident",
  analysis: "working",
  profile: "waving",
  default: "happy",
};

const MESSAGES: Record<LoadingVariant, { title: string; sub: string }> = {
  quiz: { title: "Brewing your perfect quiz", sub: "Hand-picking questions that match your level…" },
  contest: { title: "Setting up your arena", sub: "Loading the contest hall and rules…" },
  battle: { title: "Preparing the battleground", sub: "Matching you with a worthy rival…" },
  result: { title: "Crunching your score", sub: "Every mark is being counted carefully…" },
  leaderboard: { title: "Ranking the toppers", sub: "Sorting this week’s champs…" },
  analysis: { title: "Reading your strengths", sub: "Spotting topics that need more love…" },
  profile: { title: "Fetching your profile", sub: "Gathering your stats and streaks…" },
  default: { title: "Getting everything ready", sub: "Just a moment…" },
};

export function LoadingScreen({
  variant = "default",
  title,
  sub,
  fullScreen = true,
  className,
}: {
  variant?: LoadingVariant;
  title?: string;
  sub?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  const msg = MESSAGES[variant] ?? MESSAGES.default;
  const pose = mascot(MOODS[variant] ?? "happy");

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-5 px-6 text-center",
        fullScreen ? "min-h-screen" : "py-16",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="dv-stage">
        <span className="dv-glow" aria-hidden />
        <span className="dv-ring" aria-hidden />
        <img src={pose.src} alt={pose.alt} className="dv-mascot" aria-hidden />
      </div>

      <div className="space-y-1.5">
        <p className="dv-title text-base font-extrabold tracking-tight text-foreground sm:text-lg">
          {title ?? msg.title}
          <span className="dv-dots">
            <i />
            <i />
            <i />
          </span>
        </p>
        <p className="text-xs text-muted-foreground sm:text-sm">{sub ?? msg.sub}</p>
      </div>

      <div className="dv-bar" aria-hidden>
        <span />
      </div>
    </div>
  );
}

export default LoadingScreen;
