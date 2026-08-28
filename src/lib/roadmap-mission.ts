// Roadmap Task 3 — the launch contract.
//
// Spec: every mission launch carries { level_id, mission_id, source, chapter_ids }
// and every finish writes a `mission_completion` row. This module reads those
// params off the URL on the target page, records the finish, applies the
// adaptive rules (accuracy -> action) and moves chapter mastery forward.
//
// Pure client helper — never throws, so a missing table only degrades to a
// local/optimistic result instead of breaking the study pages.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  adaptiveActionFor,
  getLevel,
  getMission,
  passesQuizGate,
  type MasteryState,
  type MissionType,
  type RoadmapMission,
} from "@/lib/roadmap";
import {
  completeMission,
  fetchRoadmapState,
  type RoadmapState,
} from "@/lib/roadmap-progress";

// Roadmap tables ship as a manual migration and are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export type MissionLaunch = {
  levelId: number;
  missionId: string;
  source: "roadmap";
  chapterIds: string[];
  mission: RoadmapMission | null;
  type: MissionType | null;
};

/** Parse the launch contract out of a query string. Returns null when absent. */
export function parseMissionLaunch(search: string): MissionLaunch | null {
  const q = new URLSearchParams(search);
  if (q.get("source") !== "roadmap") return null;
  const levelId = Number(q.get("level_id"));
  const missionId = q.get("mission_id");
  if (!Number.isFinite(levelId) || levelId <= 0 || !missionId) return null;

  const mission = getMission(levelId, missionId) ?? null;
  const chapterIds = (q.get("chapter_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    levelId,
    missionId,
    source: "roadmap",
    chapterIds: chapterIds.length ? chapterIds : (mission?.launch_params.chapter_ids ?? []),
    mission,
    type: mission?.type ?? null,
  };
}

/**
 * Read the active mission launch on a target page. Client-only (uses
 * window.location), so it stays null during SSR and hydrates in.
 */
export function useMissionLaunch(): MissionLaunch | null {
  const [launch, setLaunch] = useState<MissionLaunch | null>(null);
  useEffect(() => {
    setLaunch(parseMissionLaunch(window.location.search));
  }, []);
  return launch;
}

/** Mastery state a mission type moves a chapter into. */
const MASTERY_BY_MISSION: Partial<Record<MissionType, MasteryState>> = {
  learn: "LEARNING_COMPLETE",
  nuggets: "LEARNING_COMPLETE",
  flashcards: "PRACTICING",
  notes: "LEARNING_COMPLETE",
  quiz: "TESTED",
  pyq: "TESTED",
  boss: "MASTERED",
  mock: "TESTED",
  repair: "PRACTICING",
  analysis: "TESTED",
  seal: "MASTERED",
};

const MASTERY_RANK: Record<MasteryState, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  LEARNING_COMPLETE: 2,
  PRACTICING: 3,
  TESTED: 4,
  NEEDS_REPAIR: 4,
  MASTERED: 5,
};

export type MissionFinishResult = {
  state: RoadmapState;
  /** Adaptive rule text from the spec for the reported accuracy. */
  adaptiveAction: string | null;
  /** True when a score was reported and it cleared the level's quiz gate. */
  passedGate: boolean | null;
  mastery: MasteryState | null;
  /** True when a repair mission was queued (accuracy < 50). */
  repairQueued: boolean;
};

async function updateMastery(
  userId: string,
  chapterIds: string[],
  next: MasteryState,
  accuracy: number | null,
) {
  if (chapterIds.length === 0) return;
  try {
    const existing = await db
      .from("chapter_mastery")
      .select("chapter_id, state")
      .eq("user_id", userId)
      .in("chapter_id", chapterIds);

    const current = new Map<string, MasteryState>(
      ((existing.data ?? []) as { chapter_id: string; state: MasteryState }[]).map((r) => [
        r.chapter_id,
        r.state,
      ]),
    );

    const rows = chapterIds.map((chapter_id) => {
      const prev = current.get(chapter_id) ?? "NOT_STARTED";
      // Never walk mastery backwards, except into NEEDS_REPAIR.
      const state =
        next === "NEEDS_REPAIR" || MASTERY_RANK[next] >= MASTERY_RANK[prev] ? next : prev;
      return {
        user_id: userId,
        chapter_id,
        state,
        accuracy,
        updated_at: new Date().toISOString(),
      };
    });

    await db.from("chapter_mastery").upsert(rows, { onConflict: "user_id,chapter_id" });
  } catch {
    // Migration not applied yet — mastery is best-effort.
  }
}

async function queueRepair(
  userId: string,
  launch: MissionLaunch,
  scorePercent: number,
) {
  try {
    await db.from("roadmap_repair_queue").upsert(
      {
        user_id: userId,
        level_id: launch.levelId,
        mission_id: launch.missionId,
        chapter_ids: launch.chapterIds,
        score_percent: scorePercent,
        resolved: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_id,mission_id" },
    );
  } catch {
    // Best-effort.
  }
}

/**
 * "every_finish" side of the launch contract: write the completion, apply the
 * adaptive rule and advance mastery. `scorePercent` is optional — reading
 * missions (learn / nuggets / notes) simply finish.
 */
export async function finishMission(
  userId: string,
  launch: MissionLaunch,
  opts: { scorePercent?: number | null; resultPayload?: Record<string, unknown> } = {},
): Promise<MissionFinishResult> {
  const level = getLevel(launch.levelId);
  const mission = launch.mission ?? (level ? getMission(launch.levelId, launch.missionId) : undefined);
  const score =
    typeof opts.scorePercent === "number" && Number.isFinite(opts.scorePercent)
      ? Math.max(0, Math.min(100, Math.round(opts.scorePercent)))
      : null;

  const before = await fetchRoadmapState(userId);

  const adaptiveAction = score === null ? null : adaptiveActionFor(score);
  const passedGate = score === null || !level ? null : passesQuizGate(level, score);
  const needsRepair = score !== null && score < 50;

  let mastery: MasteryState | null = null;
  if (mission) {
    mastery = needsRepair ? "NEEDS_REPAIR" : (MASTERY_BY_MISSION[mission.type] ?? "IN_PROGRESS");
  }

  // A failed gate must not seal the level — only record the attempt.
  const shouldComplete = mission ? passedGate !== false : false;

  let state = before;
  if (mission && shouldComplete) {
    state = await completeMission(userId, launch.levelId, mission, before);
  }

  try {
    await db.from("mission_completion").upsert(
      {
        user_id: userId,
        level_id: launch.levelId,
        mission_id: launch.missionId,
        mission_type: mission?.type ?? null,
        score_percent: score,
        result_payload: {
          ...(opts.resultPayload ?? {}),
          adaptive_action: adaptiveAction,
          passed_gate: passedGate,
          chapter_ids: launch.chapterIds,
        },
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,mission_id" },
    );
  } catch {
    // Best-effort: the local state already reflects the finish.
  }

  if (mastery) await updateMastery(userId, launch.chapterIds, mastery, score);
  if (needsRepair) await queueRepair(userId, launch, score as number);

  return {
    state,
    adaptiveAction,
    passedGate,
    mastery,
    repairQueued: needsRepair,
  };
}
