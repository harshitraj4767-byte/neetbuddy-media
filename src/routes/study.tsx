import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Clock,
  Crown,
  Flame,
  Lock,
  Map as MapIcon,
  Star,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { mascot } from "@/lib/mascot";
import {
  ROADMAP_META,
  ROADMAP_WORLDS,
  ROADMAP_LEVELS,
  getChapterLabels,
  getLevelsForWorld,
  isBossLevel,
  isMockLevel,
  levelMinutes,
  type RoadmapLevel,
  type RoadmapMission,
} from "@/lib/roadmap";
import {
  DEFAULT_STATE,
  SUBJECT_COLORS,
  TOTAL_XP_AVAILABLE,
  completeMission,
  fetchRoadmapState,
  isLevelUnlocked,
  levelProgress,
  missionHref,
  worldAccent,
  type RoadmapState,
} from "@/lib/roadmap-progress";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study Journey — 100 Levels | Neet Buddy" },
      {
        name: "description",
        content:
          "Climb 10 worlds and 100 levels of the NEET Buddy journey: learn NCERT, drill PYQs, beat boss quizzes and seal every chapter.",
      },
      { property: "og:title", content: "Study Journey — 100 Levels | Neet Buddy" },
      {
        property: "og:description",
        content:
          "Your full NEET syllabus as a level map — missions, XP, boss quizzes and mock arenas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyRoadmapPage,
});

/** Serpentine horizontal offsets (%) for the level trail, like a board game path. */
const TRAIL_OFFSETS = [0, 18, 27, 18, 0, -18, -27, -18, 0, 15];

function offsetFor(i: number) {
  return TRAIL_OFFSETS[i % TRAIL_OFFSETS.length];
}

function StudyRoadmapPage() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<RoadmapState>(DEFAULT_STATE);
  const [openLevel, setOpenLevel] = useState<RoadmapLevel | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!user) return;
    fetchRoadmapState(user.id).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const clearedLevels = useMemo(
    () =>
      ROADMAP_LEVELS.filter(
        (l) => levelProgress(l, state.completedMissionIds).complete,
      ).length,
    [state],
  );

  const xp = useMemo(() => {
    if (state.totalXp > 0) return state.totalXp;
    return ROADMAP_LEVELS.filter(
      (l) => levelProgress(l, state.completedMissionIds).complete,
    ).reduce((sum, l) => sum + l.xp_reward, 0);
  }, [state]);

  const currentLevel = useMemo(
    () =>
      ROADMAP_LEVELS.find((l) => l.level_id === state.currentLevel) ??
      ROADMAP_LEVELS[0],
    [state.currentLevel],
  );

  const nextMission = useMemo(() => {
    if (!currentLevel) return null;
    return (
      currentLevel.missions.find(
        (m) => !state.completedMissionIds.has(m.mission_id),
      ) ?? null
    );
  }, [currentLevel, state.completedMissionIds]);

  async function onCompleteMission(level: RoadmapLevel, mission: RoadmapMission) {
    if (!user) return;
    setSaving(mission.mission_id);
    const next = await completeMission(user.id, level.level_id, mission, state);
    setState(next);
    setSaving(null);
  }

  const heroAccent = worldAccent(currentLevel?.world_index ?? 1);
  const pose = mascot(nextMission ? "pointing" : "excited");
  const currentProg = currentLevel
    ? levelProgress(currentLevel, state.completedMissionIds)
    : null;

  return (
    <PageShell>
      {/* Player HUD */}
      <div className="grid grid-cols-4 gap-2">
        <HudChip
          icon={<Flame className="h-4 w-4" />}
          tint="#f97316"
          value={`${state.currentLevel}`}
          label="Level"
        />
        <HudChip
          icon={<Zap className="h-4 w-4" />}
          tint="#eab308"
          value={xp.toLocaleString()}
          label="XP"
        />
        <HudChip
          icon={<Trophy className="h-4 w-4" />}
          tint="#22c55e"
          value={`${clearedLevels}`}
          label="Cleared"
        />
        <HudChip
          icon={<Crown className="h-4 w-4" />}
          tint="#8b5cf6"
          value={state.plannerMode}
          label="Mode"
        />
      </div>

      {/* Current mission banner */}
      <section
        className="relative mt-3 overflow-hidden rounded-3xl p-5 text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${heroAccent.from}, ${heroAccent.to})`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/15"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10"
        />

        <div className="relative flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
              World {currentLevel?.world_index} · Level {currentLevel?.level_id} ·
              Task {(currentProg?.doneCount ?? 0) + 1}
            </div>
            <h1 className="mt-1 truncate text-lg font-extrabold sm:text-2xl">
              {currentLevel?.title}
            </h1>
            <p className="mt-0.5 line-clamp-2 text-sm text-white/85">
              {nextMission
                ? nextMission.label
                : "All tasks cleared — jump to the next level!"}
            </p>
            {nextMission && missionHref(nextMission) && (
              <Button
                asChild
                size="sm"
                className="mt-3 rounded-full bg-white font-bold text-foreground shadow-md hover:bg-white/90"
              >
                <a href={missionHref(nextMission)!}>
                  Start <ChevronRight className="ml-0.5 h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
          <img
            src={pose.src}
            alt={pose.alt}
            className="h-24 w-24 shrink-0 object-contain drop-shadow-xl sm:h-32 sm:w-32"
          />
        </div>

        <div className="relative mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-white/85">
            <span>Journey XP</span>
            <span>
              {xp.toLocaleString()} / {TOTAL_XP_AVAILABLE.toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{
                width: `${Math.min(100, (xp / TOTAL_XP_AVAILABLE) * 100)}%`,
              }}
            />
          </div>
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/study-planner">Daily planner</Link>
        </Button>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MapIcon className="h-3.5 w-3.5" />
          {ROADMAP_META.levels} levels · {ROADMAP_META.worlds} worlds
        </span>
      </div>

      {!user && !authLoading && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Link
            to="/login"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            Sign in
          </Link>{" "}
          to save your level progress and XP.
        </p>
      )}

      {/* Worlds — serpentine level trail */}
      <div className="mt-8 space-y-10">
        {ROADMAP_WORLDS.map((world) => {
          const accent = worldAccent(world.index);
          const levels = getLevelsForWorld(world.index);
          const cleared = levels.filter(
            (l) => levelProgress(l, state.completedMissionIds).complete,
          ).length;
          const worldUnlocked = levels.some((l) =>
            isLevelUnlocked(l.level_id, state),
          );
          const worldPose = mascot(world.index % 2 === 0 ? "confident" : "idea");

          return (
            <section key={world.index}>
              {/* World gate */}
              <div
                className="relative overflow-hidden rounded-3xl px-4 py-3 text-white shadow-md"
                style={{
                  background: `linear-gradient(120deg, ${accent.from}, ${accent.to})`,
                  opacity: worldUnlocked ? 1 : 0.55,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15"
                />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">
                      World {world.index} · Levels {world.levels[0]}–
                      {world.levels[1]}
                    </div>
                    <div className="truncate text-base font-extrabold">
                      {world.name}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                    {worldUnlocked ? `${cleared}/${levels.length}` : "Locked"}
                  </div>
                </div>
                <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{
                      width: `${Math.round((cleared / levels.length) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="relative mt-5">
                <img
                  src={worldPose.src}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-1/3 h-20 w-20 object-contain opacity-70 sm:h-28 sm:w-28"
                />
                <ul className="relative flex flex-col items-center">
                  {levels.map((level, i) => (
                    <li key={level.level_id} className="w-full">
                      <div
                        className="flex justify-center transition-transform"
                        style={{ transform: `translateX(${offsetFor(i)}%)` }}
                      >
                        <LevelNode
                          level={level}
                          state={state}
                          current={level.level_id === state.currentLevel}
                          onOpen={() => setOpenLevel(level)}
                        />
                      </div>
                      {i < levels.length - 1 && (
                        <TrailConnector
                          from={offsetFor(i)}
                          to={offsetFor(i + 1)}
                          color={
                            levelProgress(level, state.completedMissionIds)
                              .complete
                              ? accent.to
                              : "hsl(0 0% 60% / 0.35)"
                          }
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      <LevelSheet
        level={openLevel}
        state={state}
        saving={saving}
        signedIn={!!user}
        onClose={() => setOpenLevel(null)}
        onComplete={onCompleteMission}
      />
    </PageShell>
  );
}

function TrailConnector({
  from,
  to,
  color,
}: {
  from: number;
  to: number;
  color: string;
}) {
  const dots = [0.25, 0.5, 0.75];
  return (
    <div className="flex flex-col items-center gap-1.5 py-2" aria-hidden>
      {dots.map((t) => (
        <span
          key={t}
          className="h-2 w-2 rounded-full"
          style={{
            background: color,
            transform: `translateX(${from + (to - from) * t}%)`,
          }}
        />
      ))}
    </div>
  );
}

function HudChip({
  icon,
  value,
  label,
  tint,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/80 px-2 py-2 text-center shadow-sm">
      <div className="flex items-center justify-center gap-1.5">
        <span style={{ color: tint }}>{icon}</span>
        <span className="text-sm font-extrabold">{value}</span>
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function LevelNode({
  level,
  state,
  current,
  onOpen,
}: {
  level: RoadmapLevel;
  state: RoadmapState;
  current: boolean;
  onOpen: () => void;
}) {
  const accent = worldAccent(level.world_index);
  const unlocked = isLevelUnlocked(level.level_id, state);
  const prog = levelProgress(level, state.completedMissionIds);
  const boss = isBossLevel(level);
  const mock = isMockLevel(level);
  const big = boss || mock;
  const subjectColor = SUBJECT_COLORS[level.primary_subject] ?? accent.to;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Level ${level.level_id}: ${level.title}`}
      className="group flex w-[10.5rem] flex-col items-center gap-1.5 focus:outline-none sm:w-52"
    >
      <span className="relative">
        {current && (
          <span
            aria-hidden
            className="absolute inset-0 -m-2 animate-ping rounded-full opacity-40"
            style={{ background: accent.ring }}
          />
        )}
        <span
          className={`relative flex items-center justify-center rounded-full font-extrabold text-white transition-transform group-hover:-translate-y-1 group-active:translate-y-0.5 ${
            big ? "h-[4.75rem] w-[4.75rem] text-xl" : "h-16 w-16 text-lg"
          } ${current ? "ring-4 ring-offset-2 ring-offset-background" : ""}`}
          style={{
            background: unlocked
              ? `linear-gradient(150deg, ${accent.from}, ${accent.to})`
              : "hsl(0 0% 60% / 0.3)",
            boxShadow: unlocked
              ? `0 8px 0 0 ${accent.to}80, inset 0 2px 6px rgba(255,255,255,0.35)`
              : "0 6px 0 0 hsl(0 0% 50% / 0.25)",
            ...(current ? { ["--tw-ring-color" as string]: accent.ring } : {}),
          }}
        >
          {prog.complete ? (
            <Check className="h-7 w-7" />
          ) : unlocked ? (
            level.level_id
          ) : (
            <Lock className="h-6 w-6 text-white/80" />
          )}

          {big && (
            <span
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-white"
              style={{ background: boss ? "#e11d48" : "#6366f1" }}
            >
              {boss ? (
                <Swords className="h-3.5 w-3.5" />
              ) : (
                <Crown className="h-3.5 w-3.5" />
              )}
            </span>
          )}

          {prog.complete && !big && (
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-amber-400 text-white">
              <Star className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      </span>

      <span className="line-clamp-2 text-center text-[11px] font-semibold leading-snug">
        {level.title}
      </span>
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: subjectColor }}
        />
        {level.xp_reward} XP
      </span>

      {unlocked && prog.total > 0 && !prog.complete && (
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${prog.percent}%`,
              background: `linear-gradient(90deg, ${accent.from}, ${accent.to})`,
            }}
          />
        </span>
      )}
    </button>
  );
}

function LevelSheet({
  level,
  state,
  saving,
  signedIn,
  onClose,
  onComplete,
}: {
  level: RoadmapLevel | null;
  state: RoadmapState;
  saving: string | null;
  signedIn: boolean;
  onClose: () => void;
  onComplete: (level: RoadmapLevel, mission: RoadmapMission) => void;
}) {
  if (!level) return null;
  const accent = worldAccent(level.world_index);
  const unlocked = isLevelUnlocked(level.level_id, state);
  const prog = levelProgress(level, state.completedMissionIds);
  const chapters = getChapterLabels(level);
  const pose = mascot(prog.complete ? "thumbs-up" : "studying");

  return (
    <Sheet open={!!level} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl p-0"
      >
        <div
          className="rounded-t-3xl p-5 text-white"
          style={{
            background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
          }}
        >
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                  Level {level.level_id} · {level.world}
                </div>
                <SheetTitle className="text-xl text-white">
                  {level.title}
                </SheetTitle>
                <SheetDescription className="text-white/85">
                  {level.primary_subject} · {level.difficulty} · {level.xp_reward}{" "}
                  XP · gate {level.quiz_gate_percent}% · ~{levelMinutes(level)} min
                </SheetDescription>
              </div>
              <img
                src={pose.src}
                alt={pose.alt}
                className="h-20 w-20 shrink-0 object-contain drop-shadow-lg"
              />
            </div>
          </SheetHeader>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-white/85">
              <span>
                Tasks {prog.doneCount}/{prog.total}
              </span>
              <span>
                required {prog.requiredDone}/{prog.requiredTotal}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${prog.percent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="p-5">
          {!unlocked && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Clear level {level.level_id - 1} to unlock this level.
            </div>
          )}

          {chapters.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {chapters.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          <h3 className="mt-5 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Tasks in this level
          </h3>

          <ul className="mt-3 space-y-2 pb-6">
            {level.missions.map((m, idx) => {
              const done = state.completedMissionIds.has(m.mission_id);
              const href = missionHref(m);
              return (
                <li
                  key={m.mission_id}
                  className="flex items-center gap-3 rounded-2xl border p-3"
                  style={{
                    borderColor: done ? `${accent.ring}66` : undefined,
                    background: done ? `${accent.from}12` : undefined,
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      background: done ? accent.to : `${accent.from}22`,
                      color: done ? "#fff" : accent.to,
                    }}
                  >
                    {done ? <Check className="h-4 w-4" /> : idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {m.label}
                      {!m.required && (
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          optional
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> {m.est_minutes} min · {m.type}{" "}
                      · {m.target_page}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {unlocked && href && (
                      <Button
                        asChild
                        size="sm"
                        className="rounded-full"
                        variant={done ? "outline" : "default"}
                      >
                        <a href={href}>
                          {done ? "Redo" : "Start"}
                          <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    )}
                    {unlocked && signedIn && !done && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving === m.mission_id}
                        onClick={() => onComplete(level, m)}
                        aria-label={`Mark ${m.label} done`}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
