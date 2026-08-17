import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, RotateCcw, Eye, Loader2 } from "lucide-react";
import type { AttemptState } from "@/hooks/use-attempt-state";
import { cn } from "@/lib/utils";

/**
 * Uniform attempt controls used by Daily DPP, Mocks, DPP and PYQ cards.
 *  - never attempted → "Attempt"
 *  - left midway     → "Resume" (+ restart)
 *  - submitted       → "Reattempt" + "View solution"
 */
export function AttemptActions({
  state,
  onStart,
  busy,
  className,
  startLabel = "Attempt",
  size = "default",
}: {
  state?: AttemptState;
  /** starts a fresh attempt (also used for resume — the runner picks up the open attempt) */
  onStart: () => void;
  busy?: boolean;
  className?: string;
  startLabel?: string;
  size?: "sm" | "default";
}) {
  const spinner = busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null;

  if (!state) {
    return (
      <Button size={size} onClick={onStart} disabled={busy} className={cn("w-full bg-gradient-primary", className)}>
        {spinner ?? <PlayCircle className="mr-2 h-4 w-4" />} {startLabel}
      </Button>
    );
  }

  if (state.status === "in_progress") {
    return (
      <Button
        size={size}
        onClick={onStart}
        disabled={busy}
        className={cn("w-full bg-amber-500 text-white hover:bg-amber-500/90", className)}
      >
        {spinner ?? <PlayCircle className="mr-2 h-4 w-4" />} Resume
      </Button>
    );
  }

  return (
    <div className={cn("flex w-full gap-2", className)}>
      <Button size={size} variant="outline" onClick={onStart} disabled={busy} className="flex-1">
        {spinner ?? <RotateCcw className="mr-2 h-4 w-4" />} Reattempt
      </Button>
      <Button size={size} asChild className="flex-1 bg-gradient-primary">
        <Link to="/analysis/$attemptId" params={{ attemptId: state.attemptId }}>
          <Eye className="mr-2 h-4 w-4" /> View soln
        </Link>
      </Button>
    </div>
  );
}

export function AttemptBadge({ state }: { state?: AttemptState }) {
  if (!state) return null;
  if (state.status === "in_progress")
    return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">In progress</Badge>;
  return (
    <Badge className="bg-success/15 text-success">
      Attempted{state.score !== null ? ` · ${state.score}` : ""}
    </Badge>
  );
}
