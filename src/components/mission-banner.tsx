// Roadmap Task 3 — the on-page half of the launch contract.
// Shown on any study page opened from /study with ?source=roadmap.
// Displays the mission, and reports the finish back to the roadmap.

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getLevel } from "@/lib/roadmap";
import { worldAccent } from "@/lib/roadmap-progress";
import { finishMission, useMissionLaunch } from "@/lib/roadmap-mission";

export function MissionBanner({
  /** Optional accuracy for quiz/pyq style pages; omit for reading missions. */
  scorePercent,
  className = "",
}: {
  scorePercent?: number | null;
  className?: string;
}) {
  const launch = useMissionLaunch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!launch) return null;

  const level = getLevel(launch.levelId);
  const accent = worldAccent(level?.world_index ?? 1);
  const label = launch.mission?.label ?? "Roadmap mission";

  async function onFinish() {
    if (!user || !launch) return;
    setSaving(true);
    const res = await finishMission(user.id, launch, { scorePercent });
    setSaving(false);
    setDone(res.passedGate !== false);
    if (res.repairQueued) {
      setNote("Below 50% — a repair mission was added before this level unlocks.");
    } else if (res.passedGate === false) {
      setNote(
        `Score is under the ${level?.quiz_gate_percent ?? 70}% gate. Retry to seal this level.`,
      );
    } else {
      setNote(res.adaptiveAction ? `Roadmap: ${res.adaptiveAction}.` : "Mission marked complete.");
    }
  }

  return (
    <div
      className={`sticky top-2 z-30 mb-4 rounded-2xl border p-3 shadow-sm backdrop-blur ${className}`}
      style={{
        borderColor: `${accent.ring}55`,
        background: `linear-gradient(90deg, ${accent.from}1a, transparent)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
          style={{ background: accent.from }}
        >
          <Sparkles className="h-3 w-3" />
          Level {launch.levelId}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{label}</p>
          {level ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {level.world} · {level.title}
            </p>
          ) : null}
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => navigate({ to: "/study" })}
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Roadmap
        </Button>
        <Button size="sm" className="h-8 text-xs" onClick={onFinish} disabled={saving || done}>
          {saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          {done ? "Mission complete" : "Mark mission done"}
        </Button>
      </div>

      {note ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          {done ? null : <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />}
          {note}
        </p>
      ) : null}
    </div>
  );
}
