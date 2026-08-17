import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Play, Square, Copy, Radio, Trophy, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getStudyGroup,
  startStudySession,
  beatStudySession,
  stopStudySession,
  createGroupTask,
  toggleGroupTask,
  deleteGroupTask,
} from "@/lib/study-groups.functions";

export const Route = createFileRoute("/study-groups/$groupId")({
  head: () => ({
    meta: [
      { title: "Study room — live timer & group leaderboard" },
      { name: "description", content: "Run your live study timer, tick shared targets and track your discipline rating in this study room." },
      { property: "og:title", content: "Study room — Neet Buddy" },
      { property: "og:description", content: "Live study timer, shared targets, XP and a 0–100 discipline rating." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyGroupRoom,
  errorComponent: ({ error }) => (
    <PageShell title="Study room"><div role="alert" className="text-sm text-destructive">{error.message}</div></PageShell>
  ),
  notFoundComponent: () => <PageShell title="Study room"><div>Group not found.</div></PageShell>,
});

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function StudyGroupRoom() {
  const { groupId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login", replace: true });
  }, [loading, user, nav]);

  const getFn = useServerFn(getStudyGroup);
  const startFn = useServerFn(startStudySession);
  const beatFn = useServerFn(beatStudySession);
  const stopFn = useServerFn(stopStudySession);
  const addTaskFn = useServerFn(createGroupTask);
  const toggleFn = useServerFn(toggleGroupTask);
  const delTaskFn = useServerFn(deleteGroupTask);

  const q = useQuery({
    queryKey: ["study-group", groupId],
    queryFn: () => getFn({ data: { group_id: groupId } }),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const [tick, setTick] = useState(0);
  const [label, setLabel] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = q.data?.my_session?.id ?? null;

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Keep presence alive while a session is running.
  useEffect(() => {
    const t = setInterval(() => {
      const id = sessionRef.current;
      if (id) beatFn({ data: { session_id: id } }).catch(() => {});
    }, 45000);
    return () => clearInterval(t);
  }, [beatFn]);

  if (loading || !user) return null;
  if (q.isLoading) return <PageShell title="Study room"><Loader2 className="h-5 w-5 animate-spin" /></PageShell>;

  const data = q.data;
  if (!data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["study-group", groupId] });

  const mine = data.members.find((m: any) => m.is_me);
  const running = data.my_session;
  const elapsed = running ? (Date.now() - new Date(running.started_at).getTime()) / 1000 + tick * 0 : 0;

  const start = async () => {
    try {
      await startFn({ data: { group_id: groupId, mode: "stopwatch", label: label.trim() || null } });
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const stop = async () => {
    if (!running) return;
    try {
      const r = await stopFn({ data: { session_id: running.id } });
      toast.success(`Logged ${fmt(r.seconds)} of study`);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const addTask = async () => {
    if (taskTitle.trim().length < 2) return;
    try {
      await addTaskFn({ data: { group_id: groupId, title: taskTitle.trim() } });
      setTaskTitle("");
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const inviteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/study-groups?code=${data.group.invite_code}`
    : "";

  return (
    <PageShell eyebrow="Group study" title={data.group.name} description={data.group.description ?? undefined}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Study timer</CardTitle>
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> {data.live_count} studying now
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-4xl font-bold tabular-nums">
                {running ? fmt(elapsed) : fmt(mine?.today_seconds ?? 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {running ? `Running${running.label ? ` — ${running.label}` : ""}` : "Today's total. Start the stopwatch to go live for your group."}
              </p>
              {!running && (
                <Input placeholder="What are you studying? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
              )}
              <div className="flex gap-2">
                {running ? (
                  <Button onClick={stop} variant="destructive"><Square className="mr-2 h-4 w-4" /> Stop &amp; log</Button>
                ) : (
                  <Button onClick={start}><Play className="mr-2 h-4 w-4" /> Start studying</Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => { navigator.clipboard?.writeText(inviteUrl); toast.success("Invite link copied"); }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy invite link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Shared targets</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Add a target for the group" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} maxLength={160} />
                <Button onClick={addTask}><Plus className="h-4 w-4" /></Button>
              </div>
              {data.tasks.length === 0 && <p className="text-sm text-muted-foreground">No targets yet.</p>}
              {data.tasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <Checkbox
                    checked={t.mine_done}
                    onCheckedChange={async (v) => {
                      await toggleFn({ data: { task_id: t.id, done: !!v } });
                      refresh();
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${t.mine_done ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.due_date}</div>
                  </div>
                  {(t.created_by === user.id || data.group.is_owner) && (
                    <Button size="icon" variant="ghost" onClick={async () => { await delTaskFn({ data: { task_id: t.id } }); refresh(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.members.map((m: any, i: number) => (
              <div key={m.user_id} className={`rounded-2xl border p-3 ${m.is_me ? "border-primary/50 bg-primary/5" : "border-border"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="truncate text-sm font-semibold">{m.name}</span>
                    {m.live && <Badge className="animate-pulse">studying</Badge>}
                  </div>
                  <span className="text-sm font-bold">{m.rating}/100</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${m.rating}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span>Today {fmt(m.today_seconds)}</span>
                  <span>Week {fmt(m.week_seconds)}</span>
                  <span>{m.active_days_7}/7 days active</span>
                  <span>{m.completion_rate}% targets</span>
                  <span className="col-span-2 font-medium text-primary">{m.xp} XP</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
