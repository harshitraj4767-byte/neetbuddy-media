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

export function cleanChapterSlug(chapterName: string): string {
  return chapterName
    .replace(/^\d+[.:]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function missionHref(mission: RoadmapMission): string | null {
  const route = resolveMissionRoute(mission);
  if (!route) return null;
  const p = mission.launch_params;
  const level = getLevel(p.level_id);
  const subject = level?.primary_subject ? level.primary_subject.toLowerCase() : "biology";
  const firstChapter = level?.chapters?.[0] ?? "";
  const slug = cleanChapterSlug(firstChapter);

  const qs = new URLSearchParams({
    level_id: String(p.level_id),
    mission_id: p.mission_id,
    source: p.source,
    chapter_ids: p.chapter_ids.join(","),
    subject,
  });

  if (slug) {
    qs.set("slug", slug);
  }

  // Exact target redirection based on mission type
  if (route === "/highlighted-ncert" || route === "/ncert-key-points" || route === "/flashcards") {
    if (slug) qs.set("slug", slug);
    return `${route}?${qs.toString()}`;
  }

  if (route === "/quiz/subjects" || mission.type === "quiz" || mission.type === "boss") {
    const rawSubj = level?.primary_subject ?? "Biology";
    const cleanCh = firstChapter.replace(/^\d+[.:]\s*/, "");
    qs.set("search", cleanCh);
    qs.set("chapter", cleanCh);
    qs.set("count", "25");
    return `/subjects/${rawSubj}?${qs.toString()}`;
  }

  if (route === "/chapter-pyqs") {
    const rawSubj = level?.primary_subject ?? "Biology";
    const chParam = encodeURIComponent(firstChapter.replace(/^\d+[.:]\s*/, ""));
    return `/chapter-pyqs?subject=${encodeURIComponent(rawSubj)}&search=${chParam}&${qs.toString()}`;
  }

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
const LOCAL_STORAGE_KEY = "nb_roadmap_progress";

function getStorageKey(userId?: string): string {
  return userId ? `${LOCAL_STORAGE_KEY}_${userId}` : LOCAL_STORAGE_KEY;
}

function readLocalRoadmapState(userId?: string): RoadmapState | null {
  if (typeof window === "undefined") return null;
  try {
    const key = getStorageKey(userId);
    let raw = window.localStorage.getItem(key);
    if (!raw && userId) {
      raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      currentLevel: Math.max(1, Number(data.currentLevel || 1)),
      highestUnlocked: Math.max(1, Number(data.highestUnlocked || 1)),
      totalXp: Math.max(0, Number(data.totalXp || 0)),
      plannerMode: data.plannerMode ?? "Normal",
      completedMissionIds: new Set(Array.isArray(data.completedMissionIds) ? data.completedMissionIds : []),
      offline: false,
    };
  } catch {
    return null;
  }
}

function writeLocalRoadmapState(state: RoadmapState, userId?: string) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({
      currentLevel: state.currentLevel,
      highestUnlocked: state.highestUnlocked,
      totalXp: state.totalXp,
      plannerMode: state.plannerMode,
      completedMissionIds: Array.from(state.completedMissionIds),
    });
    window.localStorage.setItem(getStorageKey(userId), payload);
    window.localStorage.setItem(LOCAL_STORAGE_KEY, payload);
  } catch {}
}

export async function fetchRoadmapState(userId: string): Promise<RoadmapState> {
  const local = readLocalRoadmapState(userId);
  try {
    // Try Hostinger PHP API first
    try {
      const res = await fetch(`/api/roadmap.php?user_id=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.ok && json.data) {
          const d = json.data;
          const merged: RoadmapState = {
            currentLevel: Math.max(local?.currentLevel ?? 1, Number(d.current_level || 1)),
            highestUnlocked: Math.max(local?.highestUnlocked ?? 1, Number(d.highest_unlocked || 1)),
            totalXp: Math.max(local?.totalXp ?? 0, Number(d.total_xp || 0)),
            plannerMode: d.planner_mode || local?.plannerMode || "Normal",
            completedMissionIds: new Set([
              ...(Array.isArray(d.completed_mission_ids) ? d.completed_mission_ids : []),
              ...(local ? Array.from(local.completedMissionIds) : []),
            ]),
            offline: false,
          };
          writeLocalRoadmapState(merged, userId);
          return merged;
        }
      }
    } catch {}

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

    if (progressRes.error && missionsRes.error) return local ?? { ...DEFAULT_STATE };

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

    const serverState: RoadmapState = {
      currentLevel: Math.max(p?.current_level ?? 1, local?.currentLevel ?? 1),
      highestUnlocked: Math.max(p?.highest_unlocked ?? 1, local?.highestUnlocked ?? 1, 1),
      totalXp: Math.max(p?.total_xp ?? 0, local?.totalXp ?? 0),
      plannerMode: p?.planner_mode ?? local?.plannerMode ?? "Normal",
      completedMissionIds: new Set([...done, ...(local?.completedMissionIds ? Array.from(local.completedMissionIds) : [])]),
      offline: false,
    };
    writeLocalRoadmapState(serverState);
    return serverState;
  } catch {
    return local ?? { ...DEFAULT_STATE };
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

  writeLocalRoadmapState(next, userId);
  try {
    fetch("/api/roadmap.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        current_level: next.currentLevel,
        highest_unlocked: next.highestUnlocked,
        total_xp: next.totalXp,
        planner_mode: next.plannerMode,
        completed_mission_ids: Array.from(next.completedMissionIds),
      }),
    }).catch(() => {});
  } catch {}

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
