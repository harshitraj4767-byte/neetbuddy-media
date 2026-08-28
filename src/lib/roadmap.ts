// Roadmap data layer (Task 1 of the NEET Buddy Roadmap spec).
// Single source of truth: src/data/roadmap-spec.json (100 levels / 10 worlds / 81 chapters).
// Pure data + helpers only — no DB access, no React. Safe to import anywhere.

import spec from "@/data/roadmap-spec.json";

export type Subject = "Biology" | "Chemistry" | "Physics";

export type MissionType =
  | "learn"
  | "nuggets"
  | "flashcards"
  | "notes"
  | "quiz"
  | "pyq"
  | "repair"
  | "boss"
  | "mock"
  | "analysis"
  | "seal";

export type MasteryState =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "LEARNING_COMPLETE"
  | "PRACTICING"
  | "TESTED"
  | "NEEDS_REPAIR"
  | "MASTERED";

export type LaunchParams = {
  level_id: number;
  mission_id: string;
  source: "roadmap";
  chapter_ids: string[];
};

export type RoadmapMission = {
  mission_id: string;
  type: MissionType;
  label: string;
  target_page: string;
  route: string | null;
  launch_params: LaunchParams;
  reports_back: string;
  effort_points: number;
  est_minutes: number;
  required: boolean;
};

export type RoadmapLevel = {
  level_id: number;
  world: string;
  world_index: number;
  kind: string;
  primary_subject: Subject | string;
  difficulty: string;
  title: string;
  chapters: string[];
  chapter_ids: string[];
  xp_reward: number;
  quiz_gate_percent: number;
  load_effort: number;
  missions: RoadmapMission[];
};

export type RoadmapWorld = {
  index: number;
  key: string;
  name: string;
  accent_token: string;
  levels: [number, number];
};

export type RoadmapChapter = {
  subject: Subject;
  name: string;
  size: string;
  difficulty: string;
  chapter_id: string;
};

export type PlannerMode = "Light" | "Normal" | "Intense";

const RAW = spec as unknown as {
  meta: {
    name: string;
    version: string;
    levels: number;
    worlds: number;
    syllabus_closed_by_level: number;
    chapter_count: number;
    subject_counts: Record<Subject, number>;
  };
  worlds: RoadmapWorld[];
  subject_colors: Record<Subject, string>;
  chapters: RoadmapChapter[];
  mission_library: Record<
    MissionType,
    {
      label: string;
      page: string;
      route: string | null;
      effort: number;
      minutes: number;
      required: boolean;
    }
  >;
  adaptive_rules: { accuracy: string; action: string }[];
  mastery_states: MasteryState[];
  planner: {
    budgets: Record<PlannerMode, number>;
    effort_weights: Record<string, number>;
    pairing_rule: string;
    day_shape: string[];
    subject_balance: string;
    carry_over_max_per_day: number;
  };
  levels: RoadmapLevel[];
};

export const ROADMAP_META = RAW.meta;
export const ROADMAP_WORLDS = RAW.worlds;
export const ROADMAP_CHAPTERS = RAW.chapters;
export const ROADMAP_LEVELS = RAW.levels;
export const MISSION_LIBRARY = RAW.mission_library;
export const ADAPTIVE_RULES = RAW.adaptive_rules;
export const MASTERY_STATES = RAW.mastery_states;
export const PLANNER = RAW.planner;
export const TOTAL_LEVELS = RAW.levels.length;

const LEVELS_BY_ID = new Map<number, RoadmapLevel>(
  RAW.levels.map((l) => [l.level_id, l]),
);
const CHAPTERS_BY_ID = new Map<string, RoadmapChapter>(
  RAW.chapters.map((c) => [c.chapter_id, c]),
);
const CHAPTERS_BY_NAME = new Map<string, RoadmapChapter>(
  RAW.chapters.map((c) => [normalizeChapterName(c.name), c]),
);

/** "3. Human Physiology" -> "human physiology" (drops numbering + punctuation). */
export function normalizeChapterName(name: string): string {
  return name
    .replace(/^\s*\d+\s*[.)-]\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getLevel(levelId: number): RoadmapLevel | undefined {
  return LEVELS_BY_ID.get(levelId);
}

export function getMission(
  levelId: number,
  missionId: string,
): RoadmapMission | undefined {
  return getLevel(levelId)?.missions.find((m) => m.mission_id === missionId);
}

export function getWorld(worldIndex: number): RoadmapWorld | undefined {
  return ROADMAP_WORLDS.find((w) => w.index === worldIndex);
}

export function getWorldForLevel(levelId: number): RoadmapWorld | undefined {
  return ROADMAP_WORLDS.find(
    (w) => levelId >= w.levels[0] && levelId <= w.levels[1],
  );
}

export function getLevelsForWorld(worldIndex: number): RoadmapLevel[] {
  return ROADMAP_LEVELS.filter((l) => l.world_index === worldIndex);
}

export function getChapterById(chapterId: string): RoadmapChapter | undefined {
  return CHAPTERS_BY_ID.get(chapterId);
}

/** Resolve a DB/UI chapter title to the roadmap chapter (numbering-insensitive). */
export function findChapterByName(name: string): RoadmapChapter | undefined {
  return CHAPTERS_BY_NAME.get(normalizeChapterName(name));
}

export function getChapterLabels(level: RoadmapLevel): string[] {
  return level.chapter_ids.map(
    (id) => getChapterById(id)?.name ?? id,
  );
}

export function levelsForChapter(chapterId: string): RoadmapLevel[] {
  return ROADMAP_LEVELS.filter((l) => l.chapter_ids.includes(chapterId));
}

export function requiredMissions(level: RoadmapLevel): RoadmapMission[] {
  return level.missions.filter((m) => m.required);
}

export function levelMinutes(level: RoadmapLevel): number {
  return level.missions.reduce((sum, m) => sum + m.est_minutes, 0);
}

export function isBossLevel(level: RoadmapLevel): boolean {
  return level.missions.some((m) => m.type === "boss");
}

export function isMockLevel(level: RoadmapLevel): boolean {
  return level.missions.some((m) => m.type === "mock");
}

/** Adaptive rule from the spec, resolved for a score percentage. */
export function adaptiveActionFor(scorePercent: number): string {
  if (scorePercent >= 85) return "continue";
  if (scorePercent >= 70) return "continue + suggested revision";
  if (scorePercent >= 50) return "insert custom practice mission";
  return "mandatory repair mission + retest before unlock";
}

/** Whether a quiz/boss result clears the level's gate. */
export function passesQuizGate(
  level: RoadmapLevel,
  scorePercent: number,
): boolean {
  return scorePercent >= level.quiz_gate_percent;
}

/** Daily effort budget in effort points for a planner mode. */
export function plannerBudget(mode: PlannerMode): number {
  return PLANNER.budgets[mode];
}

/**
 * Build the launch URL for a mission, carrying the launch contract as query
 * params so the target page can report back (level_id, mission_id, source,
 * chapter_ids).
 */
export function missionLaunchHref(mission: RoadmapMission): string | null {
  if (!mission.route) return null;
  const p = mission.launch_params;
  const qs = new URLSearchParams({
    level_id: String(p.level_id),
    mission_id: p.mission_id,
    source: p.source,
    chapter_ids: p.chapter_ids.join(","),
  });
  return `${mission.route}?${qs.toString()}`;
}

export const SUBJECT_TOKENS: Record<Subject, string> = {
  Biology: "--subject-bio",
  Chemistry: "--subject-chem",
  Physics: "--subject-phy",
};
