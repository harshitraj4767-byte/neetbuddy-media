// Roadmap progress layer (Task 2 — world/level map on /study).
// Reads per-user progress from Lovable Cloud when the roadmap tables exist
// (supabase/migrations-manual/20260828_roadmap_levels.sql). Falls back to a
// local, read-only "level 1 unlocked" state so the map always renders.

import { supabase } from "@/integrations/supabase/client";

/**
 * The roadmap tables ship as a manual migration, so they are not present in the
 * generated Supabase types yet. Access them through an untyped view.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };
import {
  ROADMAP_LEVELS,
  getLevel,
  requiredMissions,
  type RoadmapLevel,
  type RoadmapMission,
  type PlannerMode,
} from "@/lib/roadmap";

export type RoadmapState = {
  currentLevel: number;
  highestUnlocked: number;
  totalXp: number;
  plannerMode: PlannerMode;
  completedMissionIds: Set<string>;
  /** true when the roadmap tables are not reachable (migration not applied). */
  offline: boolean;
};

export const DEFAULT_STATE: RoadmapState = {
  currentLevel: 1,
  highestUnlocked: 1,
  totalXp: 0,
  plannerMode: "Normal",
  completedMissionIds: new Set<string>(),
  offline: true,
};

/** World accent colours (spec: --world-teal … --world-gold). */
export const WORLD_ACCENTS: Record<number, { from: string; to: string; ring: string }> = {
  1: { from: "#14b8a6", to: "#0d9488", ring: "#14b8a6" },
  2: { from: "#22c55e", to: "#16a34a", ring: "#22c55e" },
  3: { from: "#84cc16", to: "#65a30d", ring: "#84cc16" },
  4: { from: "#06b6d4", to: "#0891b2", ring: "#06b6d4" },
  5: { from: "#3b82f6", to: "#2563eb", ring: "#3b82f6" },
  6: { from: "#6366f1", to: "#4f46e5", ring: "#6366f1" },
  7: { from: "#8b5cf6", to: "#7c3aed", ring: "#8b5cf6" },
  8: { from: "#f43f5e", to: "#e11d48", ring: "#f43f5e" },
  9: { from: "#f59e0b", to: "#d97706", ring: "#f59e0b" },
  10: { from: "#eab308", to: "#ca8a04", ring: "#eab308" },
};

export function worldAccent(worldIndex: number) {
  return WORLD_ACCENTS[worldIndex] ?? WORLD_ACCENTS[1];
}

export const SUBJECT_COLORS: Record<string, string> = {
  Biology: "#16a34a",
  Chemistry: "#f59e0b",
  Physics: "#6366f1",
};

/**
 * The roadmap spec targets future /study/* pages. Until those exist, launch
 * missions on the equivalent live pages.
 */
const ROUTE_OVERRIDES: Record<string, string> = {
  "/study/ncert": "/highlighted-ncert",
  "/study/nuggets": "/ncert-key-points",
  "/study/flashcards": "/flashcards",
  "/study/notes": "/study-essentials",
  "/study/quiz": "/quiz/subjects",
  "/study/pyq": "/chapter-pyqs",
  "/study/repair": "/mistakes",
  "/study/boss": "/quiz/subjects",
  "/study/mock": "/mocks",
  "/study/analysis": "/analyse",
  "/study/seal": "/progress",
};

export function resolveMissionRoute(mission: RoadmapMission): string | null {
  if (!mission.route) return null;
  return ROUTE_OVERRIDES[mission.route] ?? mission.route;
}

export function missionHref(mission: RoadmapMission): string | null {
  const route = resolveMissionRoute(mission);
  if (!route) return null;
  const p = mission.launch_params;
  const qs = new URLSearchParams({
    level_id: String(p.level_id),
    mission_id: p.mission_id,
    source: p.source,
    chapter_ids: p.chapter_ids.join(","),
  });
  return `${route}?${qs.toString()}`;
}

export function levelProgress(level: RoadmapLevel, done: Set<string>) {
  const required = requiredMissions(level);
  const doneCount = level.missions.filter((m) => done.has(m.mission_id)).length;
  const requiredDone = required.filter((m) => done.has(m.mission_id)).length;
  return {
    doneCount,
    total: level.missions.length,
    requiredDone,
    requiredTotal: required.length,
    complete: required.length > 0 && requiredDone === required.length,
    percent: level.missions.length
      ? Math.round((doneCount / level.missions.length) * 100)
      : 0,
  };
}

export function isLevelUnlocked(levelId: number, state: RoadmapState) {
  return levelId <= state.highestUnlocked;
}

export function xpEarned(state: RoadmapState) {
  if (state.totalXp > 0) return state.totalXp;
  // Derive from completed levels when the server value is missing.
  return ROADMAP_LEVELS.filter(
    (l) => levelProgress(l, state.completedMissionIds).complete,
  ).reduce((sum, l) => sum + l.xp_reward, 0);
}

export const TOTAL_XP_AVAILABLE = ROADMAP_LEVELS.reduce(
  (s, l) => s + l.xp_reward,
  0,
);

/** Load progress + completions for a signed-in user. Never throws. */
export async function fetchRoadmapState(userId: string): Promise<RoadmapState> {
  try {
    const [progressRes, missionsRes] = await Promise.all([
      db
        .from("roadmap_progress")
        .select("current_level, highest_unlocked, total_xp, planner_mode")
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("mission_completion")
        .select("mission_id")
        .eq("user_id", userId),
    ]);

    if (progressRes.error && missionsRes.error) return { ...DEFAULT_STATE };

    const done = new Set<string>(
      ((missionsRes.data ?? []) as { mission_id: string }[]).map(
        (r) => r.mission_id,
      ),
    );
    const p = progressRes.data as
      | {
          current_level: number;
          highest_unlocked: number;
          total_xp: number;
          planner_mode: PlannerMode;
        }
      | null;

    return {
      currentLevel: p?.current_level ?? 1,
      highestUnlocked: Math.max(p?.highest_unlocked ?? 1, 1),
      totalXp: p?.total_xp ?? 0,
      plannerMode: p?.planner_mode ?? "Normal",
      completedMissionIds: done,
      offline: false,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Record a mission completion and, when every required mission of the level is
 * done, award XP and unlock the next level. Returns the updated state.
 */
export async function completeMission(
  userId: string,
  levelId: number,
  mission: RoadmapMission,
  state: RoadmapState,
): Promise<RoadmapState> {
  const done = new Set(state.completedMissionIds);
  done.add(mission.mission_id);

  const level = getLevel(levelId);
  const wasComplete = level ? levelProgress(level, state.completedMissionIds).complete : false;
  const nowComplete = level ? levelProgress(level, done).complete : false;
  const justCleared = !wasComplete && nowComplete;

  const next: RoadmapState = {
    ...state,
    completedMissionIds: done,
    totalXp: justCleared && level ? state.totalXp + level.xp_reward : state.totalXp,
    highestUnlocked:
      justCleared && level
        ? Math.min(Math.max(state.highestUnlocked, levelId + 1), ROADMAP_LEVELS.length)
        : state.highestUnlocked,
    currentLevel: justCleared ? Math.min(levelId + 1, ROADMAP_LEVELS.length) : state.currentLevel,
  };

  try {
    await db.from("mission_completion").upsert(
      {
        user_id: userId,
        level_id: levelId,
        mission_id: mission.mission_id,
        mission_type: mission.type,
      },
      { onConflict: "user_id,mission_id" },
    );
    await db.from("roadmap_progress").upsert(
      {
        user_id: userId,
        current_level: next.currentLevel,
        highest_unlocked: next.highestUnlocked,
        total_xp: next.totalXp,
        planner_mode: next.plannerMode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    // Table missing / offline — keep the optimistic local state.
  }

  return next;
}
