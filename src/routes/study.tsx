import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Clock,
  Flame,
  Lock,
  Sparkles,
  Star,
  Swords,
  Trophy,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
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
  xpEarned,
  type RoadmapState,
} from "@/lib/roadmap-progress";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study Roadmap — 100 Levels | Neet Buddy" },
      {
        name: "description",
        content:
          "Climb 10 worlds and 100 levels of the NEET Buddy roadmap: learn NCERT, drill PYQs, beat boss quizzes and seal every chapter.",
      },
      { property: "og:title", content: "Study Roadmap — 100 Levels | Neet Buddy" },
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

  const xp = useMemo(() => xpEarned(state), [state]);
  const clearedLevels = useMemo(
    () =>
      ROADMAP_LEVELS.filter((l) => levelProgress(l, state.completedMissionIds).complete)
        .length,
    [state],
  );

  async function onCompleteMission(level: RoadmapLevel, mission: RoadmapMission) {
    if (!user) return;
    setSaving(mission.mission_id);
    const next = await completeMission(user.id, level.level_id, mission, state);
    setState(next);
    setSaving(null);
  }

  return (
    <PageShell>
      {/* Hero / stats */}
      <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-card via-background to-card p-5 shadow-glow sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          {ROADMAP_META.name}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
          Your NEET journey, level by level
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {ROADMAP_META.levels} levels across {ROADMAP_META.worlds} worlds. Full syllabus
          closed by level {ROADMAP_META.syllabus_closed_by_level}, then revision and NEET-ready
          arenas.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<Flame className="h-4 w-4" />} label="Current level" value={`${state.currentLevel}`} />
          <StatCard icon={<Star className="h-4 w-4" />} label="XP earned" value={xp.toLocaleString()} />
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Levels cleared" value={`${clearedLevels}/${ROADMAP_META.levels}`} />
          <StatCard icon={<Swords className="h-4 w-4" />} label="Planner mode" value={state.plannerMode} />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Roadmap XP</span>
            <span>
              {xp.toLocaleString()} / {TOTAL_XP_AVAILABLE.toLocaleString()}
            </span>
          </div>
          <Progress value={(xp / TOTAL_XP_AVAILABLE) * 100} className="h-2" />
        </div>

        {!user && !authLoading && (
          <p className="mt-4 text-xs text-muted-foreground">
            <Link to="/login" className="font-semibold text-primary underline-offset-2 hover:underline">
              Sign in
            </Link>{" "}
            to save your level progress and XP.
          </p>
        )}
      </section>

      {/* Worlds */}
      <div className="mt-8 space-y-10">
        {ROADMAP_WORLDS.map((world) => {
          const accent = worldAccent(world.index);
          const levels = getLevelsForWorld(world.index);
          const cleared = levels.filter(
            (l) => levelProgress(l, state.completedMissionIds).complete,
          ).length;
          const worldUnlocked = levels.some((l) => isLevelUnlocked(l.level_id, state));

          return (
            <section key={world.index}>
              <div
                className="flex items-center justify-between gap-3 rounded-2xl border p-4"
                style={{
                  borderColor: `${accent.ring}40`,
                  background: `linear-gradient(135deg, ${accent.from}1f, transparent 70%)`,
                }}
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent.to }}>
                    World {world.index} · Levels {world.levels[0]}–{world.levels[1]}
                  </div>
                  <h2 className="truncate text-lg font-bold sm:text-xl">{world.name}</h2>
                </div>
                <div className="shrink-0 text-right">
                  {worldUnlocked ? (
                    <span className="text-sm font-semibold" style={{ color: accent.to }}>
                      {cleared}/{levels.length}
                    </span>
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">cleared</div>
                </div>
              </div>

              {/* Serpentine level trail */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {levels.map((level, i) => (
                  <LevelNode
                    key={level.level_id}
                    level={level}
                    state={state}
                    offsetRow={i % 2 === 1}
                    onOpen={() => setOpenLevel(level)}
                  />
                ))}
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

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}

function LevelNode({
  level,
  state,
  offsetRow,
  onOpen,
}: {
  level: RoadmapLevel;
  state: RoadmapState;
  offsetRow: boolean;
  onOpen: () => void;
}) {
  const accent = worldAccent(level.world_index);
  const unlocked = isLevelUnlocked(level.level_id, state);
  const prog = levelProgress(level, state.completedMissionIds);
  const boss = isBossLevel(level);
  const mock = isMockLevel(level);
  const subjectColor = SUBJECT_COLORS[level.primary_subject] ?? accent.to;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-transform ${
        unlocked ? "hover:-translate-y-0.5" : "opacity-70"
      } ${offsetRow ? "sm:mt-6" : ""}`}
      style={{
        borderColor: prog.complete ? accent.ring : `${accent.ring}33`,
        background: unlocked
          ? `linear-gradient(160deg, ${accent.from}1a, transparent 75%)`
          : undefined,
      }}
      aria-label={`Level ${level.level_id}: ${level.title}`}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold text-white shadow-md"
          style={{
            background: unlocked
              ? `linear-gradient(140deg, ${accent.from}, ${accent.to})`
              : "hsl(0 0% 60% / 0.35)",
          }}
        >
          {prog.complete ? <Check className="h-5 w-5" /> : unlocked ? level.level_id : <Lock className="h-4 w-4" />}
        </span>
        {(boss || mock) && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: boss ? accent.to : subjectColor }}
          >
            {boss ? "Boss" : "Mock"}
          </span>
        )}
      </div>

      <div className="w-full">
        <div className="line-clamp-2 text-xs font-semibold leading-snug">{level.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: subjectColor }} />
          {level.primary_subject} · {level.xp_reward} XP
        </div>
      </div>

      {unlocked && prog.total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${prog.percent}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }}
          />
        </div>
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

  return (
    <Sheet open={!!level} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader className="text-left">
          <div
            className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
            style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
          >
            Level {level.level_id} · {level.world}
          </div>
          <SheetTitle className="text-xl">{level.title}</SheetTitle>
          <SheetDescription>
            {level.primary_subject} · {level.difficulty} · {level.xp_reward} XP · pass gate{" "}
            {level.quiz_gate_percent}% · ~{levelMinutes(level)} min
          </SheetDescription>
        </SheetHeader>

        {!unlocked && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Clear level {level.level_id - 1} to unlock this level.
          </div>
        )}

        {chapters.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {chapters.map((c) => (
              <span key={c} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium">
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Missions {prog.doneCount}/{prog.total}
            </span>
            <span>
              required {prog.requiredDone}/{prog.requiredTotal}
            </span>
          </div>
          <Progress value={prog.percent} className="h-2" />
        </div>

        <ul className="mt-4 space-y-2 pb-6">
          {level.missions.map((m) => {
            const done = state.completedMissionIds.has(m.mission_id);
            const href = missionHref(m);
            return (
              <li
                key={m.mission_id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: done ? accent.to : `${accent.from}22`,
                    color: done ? "#fff" : accent.to,
                  }}
                >
                  {done ? <Check className="h-4 w-4" /> : m.type.slice(0, 2).toUpperCase()}
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
                    <Clock className="h-3 w-3" /> {m.est_minutes} min · {m.target_page}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {unlocked && href && (
                    <Button asChild size="sm" variant={done ? "outline" : "default"}>
                      <a href={href}>
                        Start <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
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
      </SheetContent>
    </Sheet>
  );
}
