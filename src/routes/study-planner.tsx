import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  Flame,
  Gauge,
  Layers,
  Sparkles,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import type { PlannerMode } from "@/lib/roadmap";
import {
  DEFAULT_STATE,
  SUBJECT_COLORS,
  completeMission,
  fetchRoadmapState,
  type RoadmapState,
} from "@/lib/roadmap-progress";
import {
  PLANNER_MODES,
  PLANNER_MODE_INFO,
  buildPlan,
  type PlannedTask,
} from "@/lib/roadmap-planner";

export const Route = createFileRoute("/study-planner")({
  head: () => ({
    meta: [
      { title: "Study Planner — Your 7 Day Roadmap Plan | Neet Buddy" },
      {
        name: "description",
        content:
          "A day-by-day NEET study plan built from your roadmap progress: balanced subjects, heavy-to-light day shape and a daily effort budget you choose.",
      },
      { property: "og:title", content: "Study Planner — Your 7 Day Roadmap Plan | Neet Buddy" },
      {
        property: "og:description",
        content:
          "Light, Normal or Intense — the planner splits your pending roadmap missions into balanced study days.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyPlannerPage,
});

function StudyPlannerPage() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<RoadmapState>(DEFAULT_STATE);
  const [mode, setMode] = useState<PlannerMode>("Normal");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!user) return;
    fetchRoadmapState(user.id).then((s) => {
      if (!alive) return;
      setState(s);
      setMode(s.plannerMode);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const plan = useMemo(() => buildPlan(state, mode, 7), [state, mode]);

  async function chooseMode(next: PlannerMode) {
    setMode(next);
    setState((s) => ({ ...s, plannerMode: next }));
    if (user) {
      const { savePlannerMode } = await import("@/lib/roadmap-planner");
      await savePlannerMode(user.id, next);
    }
  }

  async function markDone(task: PlannedTask) {
    if (!user) return;
    setSaving(task.key);
    const next = await completeMission(user.id, task.level.level_id, task.mission, state);
    setState(next);
    setSaving(null);
  }

  const today = plan.days[0];

  return (
    <PageShell>
      {/* Banner */}
      <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-card via-background to-card p-5 shadow-glow sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Study Planner
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
          Your next 7 days, planned for you
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          The planner takes the missions left on your roadmap and splits them into balanced
          days — a heavy anchor, then practice, then light recall, always with more than one
          subject in play.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Gauge className="h-4 w-4" />} label="Daily budget" value={`${plan.budget} pts`} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Planned time" value={`${Math.round(plan.totalMinutes / 60)}h`} />
          <Stat icon={<Layers className="h-4 w-4" />} label="Tasks queued" value={`${plan.totalTasks}`} />
          <Stat icon={<Flame className="h-4 w-4" />} label="Biology load" value={`${plan.biologyShare}%`} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {PLANNER_MODES.map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => chooseMode(m)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{PLANNER_MODE_INFO[m].label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {PLANNER_MODE_INFO[m].blurb}
                </p>
              </button>
            );
          })}
        </div>

        {!user && !authLoading && (
          <p className="mt-4 text-xs text-muted-foreground">
            <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to plan from your real roadmap progress and tick tasks off.
          </p>
        )}
      </section>

      {/* Today focus */}
      {today && today.tasks.length > 0 && (
        <section className="mt-8 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                Today's focus
              </div>
              <h2 className="mt-1 text-lg font-bold">
                {today.tasks[0].level.title}
              </h2>
            </div>
            {today.tasks[0].href && (
              <Button asChild>
                <a href={today.tasks[0].href}>
                  Start {today.tasks[0].mission.label}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Effort used today</span>
              <span>
                {today.effort} / {today.budget} pts · {today.minutes} min
              </span>
            </div>
            <Progress value={Math.min(100, (today.effort / today.budget) * 100)} className="h-2" />
          </div>
        </section>
      )}

      {/* Days */}
      <div className="mt-8 space-y-5">
        {plan.days.map((day) => (
          <section
            key={day.dayIndex}
            className="rounded-3xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">{day.label}</h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{day.effort} / {day.budget} pts</span>
                <span>·</span>
                <span>{day.minutes} min</span>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {day.subjects.map((s) => (
                <span
                  key={s}
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ backgroundColor: SUBJECT_COLORS[s] ?? "#64748b" }}
                >
                  {s}
                </span>
              ))}
            </div>

            {day.tasks.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Rest day — nothing pending in your roadmap for this slot.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {day.tasks.map((task) => (
                  <li
                    key={task.key}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/60 p-3"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: SUBJECT_COLORS[task.subject] ?? "#64748b" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {task.mission.label}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {task.slot}
                        </span>
                        {task.carryOver && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                            carry-over
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        L{task.level.level_id} · {task.level.title}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{task.minutes} min</span>
                    <div className="flex items-center gap-2">
                      {task.href && (
                        <Button asChild size="sm" variant="secondary">
                          <a href={task.href}>Open</a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!user || saving === task.key}
                        onClick={() => markDone(task)}
                      >
                        {saving === task.key ? "Saving…" : "Done"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <span>
          {plan.pendingTasks} missions pending across your roadmap.
          {plan.allSubjectsCovered
            ? " All three subjects appear this week."
            : " Add more days to cover all three subjects."}
        </span>
        <Button asChild variant="secondary">
          <Link to="/study">Back to roadmap</Link>
        </Button>
      </div>
    </PageShell>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}
