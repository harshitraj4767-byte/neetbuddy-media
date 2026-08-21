import drVanshu from "@/assets/dr-vanshu.webp";
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

const MESSAGES: Record<LoadingVariant, { title: string; sub: string }> = {
  quiz: { title: "Dr Vanshu is preparing quiz for u", sub: "Picking the best questions…" },
  contest: { title: "Dr Vanshu is creating contest for u", sub: "Setting up the arena…" },
  battle: { title: "Dr Vanshu is setting up battlegrounds for u", sub: "Finding your opponent…" },
  result: { title: "Dr Vanshu is checking your result", sub: "Calculating every mark…" },
  leaderboard: { title: "Dr Vanshu is ranking everyone", sub: "Sorting the toppers…" },
  analysis: { title: "Dr Vanshu is analysing your attempt", sub: "Spotting your weak areas…" },
  profile: { title: "Dr Vanshu is fetching your details", sub: "Almost there…" },
  default: { title: "Dr Vanshu is getting things ready", sub: "Just a moment…" },
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
        <img src={drVanshu} alt="" className="dv-mascot" aria-hidden />
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
