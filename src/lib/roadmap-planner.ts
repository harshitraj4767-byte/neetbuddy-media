// Roadmap planner (Task 4 of the NEET Buddy Roadmap spec).
// Turns the pending roadmap missions into a day-by-day plan that respects the
// spec's planner block: effort budgets per mode, the heavy -> medium -> light
// day shape, the cross-subject pairing rule, subject balance and the
// carry-over cap of one task per day.
//
// Pure functions only (plus one small persistence helper at the bottom).

import { supabase } from "@/integrations/supabase/client";
import {
  PLANNER,
  ROADMAP_LEVELS,
  type PlannerMode,
  type RoadmapLevel,
  type RoadmapMission,
} from "@/lib/roadmap";
import {
  levelProgress,
  missionHref,
  type RoadmapState,
} from "@/lib/roadmap-progress";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export const PLANNER_MODES: PlannerMode[] = ["Light", "Normal", "Intense"];

export const PLANNER_MODE_INFO: Record<
  PlannerMode,
  { label: string; blurb: string }
> = {
  Light: { label: "Light", blurb: "Short daily touch — school days, tired days." },
  Normal: { label: "Normal", blurb: "Steady pace that closes the syllabus on time." },
  Intense: { label: "Intense", blurb: "Full-throttle drop — long study days only." },
};

export type PlannedTask = {
  key: string;
  mission: RoadmapMission;
  level: RoadmapLevel;
  subject: string;
  effort: number;
  minutes: number;
  /** Position in the day shape: heavy anchor / medium practice / light recall. */
  slot: "heavy anchor" | "medium practice" | "light recall";
  href: string | null;
  /** true when the task only fits as the day's single allowed carry-over. */
  carryOver: boolean;
};

export type PlannedDay = {
  dayIndex: number;
  date: Date;
  label: string;
  tasks: PlannedTask[];
  effort: number;
  minutes: number;
  subjects: string[];
  budget: number;
};

export type PlanSummary = {
  mode: PlannerMode;
  budget: number;
  days: PlannedDay[];
  totalTasks: number;
  totalMinutes: number;
  pendingTasks: number;
  /** true when every scheduled day has 2+ subjects. */
  subjectBalanceOk: boolean;
  /** true when all three subjects appear inside the planned window. */
  allSubjectsCovered: boolean;
  biologyShare: number;
};

/** Effort for a mission — spec effort_weights first, mission value as fallback. */
export function taskEffort(mission: RoadmapMission): number {
  const weights = PLANNER.effort_weights as Record<string, number>;
  if (mission.type === "boss" || mission.type === "mock") {
    return weights["boss_or_mock"] ?? mission.effort_points;
  }
  return weights[mission.type] ?? mission.effort_points;
}

function slotFor(effort: number): PlannedTask["slot"] {
  if (effort >= 8) return "heavy anchor";
  if (effort >= 5) return "medium practice";
  return "light recall";
}

const SLOT_ORDER: Record<PlannedTask["slot"], number> = {
  "heavy anchor": 0,
  "medium practice": 1,
  "light recall": 2,
};

function isHard(level: RoadmapLevel): boolean {
  return level.difficulty === "hard" || level.difficulty === "very_hard";
}

/**
 * Every mission still to do, in roadmap order, starting at the user's current
 * level. Seal missions are in-app awards and never scheduled.
 */
export function pendingTasks(state: RoadmapState): PlannedTask[] {
  const out: PlannedTask[] = [];
  for (const level of ROADMAP_LEVELS) {
    if (level.level_id < state.currentLevel) {
      // Older levels can still have unfinished optional work — skip cleared ones.
      if (levelProgress(level, state.completedMissionIds).complete) continue;
    }
    for (const mission of level.missions) {
      if (mission.type === "seal") continue;
      if (state.completedMissionIds.has(mission.mission_id)) continue;
      if (!mission.required && mission.type === "repair") continue;
      const effort = taskEffort(mission);
      out.push({
        key: `${level.level_id}:${mission.mission_id}`,
        mission,
        level,
        subject: String(level.primary_subject),
        effort,
        minutes: mission.est_minutes,
        slot: slotFor(effort),
        href: missionHref(mission),
        carryOver: false,
      });
    }
  }
  return out;
}

function dayLabel(date: Date, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

/**
 * Build a `days`-long plan from the pending missions.
 *
 * Rules applied (from the spec's planner block):
 *  - daily effort budget = PLANNER.budgets[mode]
 *  - a day may exceed the budget by at most one carried-over task
 *    (carry_over_max_per_day = 1)
 *  - pairing rule: after a hard-chapter task, prefer an easy/recall task from a
 *    different subject
 *  - tasks inside a day are ordered heavy anchor -> medium practice -> light recall
 */
export function buildPlan(
  state: RoadmapState,
  mode: PlannerMode,
  days = 7,
  today = new Date(),
): PlanSummary {
  const budget = PLANNER.budgets[mode];
  const carryMax = PLANNER.carry_over_max_per_day ?? 1;
  const queue = pendingTasks(state);
  const remaining = [...queue];
  const plan: PlannedDay[] = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const day: PlannedDay = {
      dayIndex: d,
      date,
      label: dayLabel(date, d),
      tasks: [],
      effort: 0,
      minutes: 0,
      subjects: [],
      budget,
    };

    let carried = 0;
    let lastWasHard = false;

    while (remaining.length > 0) {
      // Candidate selection honours the pairing rule: after a hard task, look
      // ahead for a light task from another subject.
      let pick = 0;
      if (lastWasHard) {
        const alt = remaining.findIndex(
          (t) =>
            t.effort <= 3 &&
            !day.subjects.includes(t.subject) &&
            t.effort + day.effort <= budget,
        );
        if (alt >= 0) pick = alt;
      } else if (day.tasks.length > 0 && day.subjects.length < 2) {
        const alt = remaining.findIndex(
          (t) => !day.subjects.includes(t.subject) && t.effort + day.effort <= budget,
        );
        if (alt >= 0) pick = alt;
      }

      const candidate = remaining[pick];
      const fits = day.effort + candidate.effort <= budget;

      if (!fits) {
        // Allow a single carry-over task past the budget, then close the day.
        if (day.tasks.length > 0 && carried < carryMax) {
          carried++;
          remaining.splice(pick, 1);
          day.tasks.push({ ...candidate, carryOver: true });
          day.effort += candidate.effort;
          day.minutes += candidate.minutes;
          if (!day.subjects.includes(candidate.subject)) day.subjects.push(candidate.subject);
        }
        break;
      }

      remaining.splice(pick, 1);
      day.tasks.push(candidate);
      day.effort += candidate.effort;
      day.minutes += candidate.minutes;
      if (!day.subjects.includes(candidate.subject)) day.subjects.push(candidate.subject);
      lastWasHard = candidate.effort >= 6 || isHard(candidate.level);
    }

    day.tasks.sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
    plan.push(day);
    if (remaining.length === 0) break;
  }

  const scheduled = plan.flatMap((d) => d.tasks);
  const subjectsInWindow = new Set(scheduled.map((t) => t.subject));
  const bioEffort = scheduled
    .filter((t) => t.subject === "Biology")
    .reduce((s, t) => s + t.effort, 0);
  const totalEffort = scheduled.reduce((s, t) => s + t.effort, 0);

  return {
    mode,
    budget,
    days: plan,
    totalTasks: scheduled.length,
    totalMinutes: scheduled.reduce((s, t) => s + t.minutes, 0),
    pendingTasks: queue.length,
    subjectBalanceOk: plan
      .filter((d) => d.tasks.length > 1)
      .every((d) => d.subjects.length >= 2),
    allSubjectsCovered: subjectsInWindow.size >= 3,
    biologyShare: totalEffort ? Math.round((bioEffort / totalEffort) * 100) : 0,
  };
}

/** Persist the chosen planner mode. Never throws. */
export async function savePlannerMode(userId: string, mode: PlannerMode) {
  try {
    await db.from("roadmap_progress").upsert(
      {
        user_id: userId,
        planner_mode: mode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    // Migration not applied yet — keep the local choice.
  }
}
