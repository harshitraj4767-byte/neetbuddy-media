import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChecklistPerformance } from "@/components/checklist-performance";
import { toast } from "sonner";
import { Loader2, Plus, Sun, Moon, Trash2, Sparkles, Heart, CloudRain } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getMyChecklist,
  submitMorningChecklist,
  toggleChecklistItem,
  submitNightReflection,
  listMyChecklistHistory,
} from "@/lib/daily-checklist.functions";

export const Route = createFileRoute("/daily-checklist")({
  head: () => ({ meta: [
    { title: "Daily Checklist — Morning tasks & night reflection" },
    { name: "description", content: "Plan your morning tasks and reflect at night. Stay on track with a personal daily checklist." },
  ] }),
  component: DailyChecklistPage,
});

function DailyChecklistPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/login", replace: true });
  }, [loading, user, nav]);

  const qc = useQueryClient();
  const getToday = useServerFn(getMyChecklist);
  const submitMorning = useServerFn(submitMorningChecklist);
  const toggleItem = useServerFn(toggleChecklistItem);
  const submitNight = useServerFn(submitNightReflection);
  const history = useServerFn(listMyChecklistHistory);

  const todayQ = useQuery({
    queryKey: ["checklist", "today"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/checklist.php?action=today");
        if (res.ok) {
          const d = await res.json();
          return { checklist: d.checklist, items: d.items ?? [] };
        }
      } catch {}
      return getToday({ data: {} });
    },
    enabled: !!user,
  });
  const historyQ = useQuery({
    queryKey: ["checklist", "history"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/checklist.php?action=history&days=14");
        if (res.ok) {
          const d = await res.json();
          return d.history ?? [];
        }
      } catch {}
      return history({ data: { days: 14 } });
    },
    enabled: !!user,
  });

  const [newTasks, setNewTasks] = useState<string[]>(["", "", ""]);
  const [good, setGood] = useState("");
  const [regret, setRegret] = useState("");
  const [savingMorning, setSavingMorning] = useState(false);
  const [savingNight, setSavingNight] = useState(false);

  useEffect(() => {
    setGood(todayQ.data?.checklist?.good_things ?? "");
    setRegret(todayQ.data?.checklist?.regrets ?? "");
  }, [todayQ.data?.checklist?.id]);

  if (loading || !user) return null;

  const cl = todayQ.data?.checklist;
  const items = todayQ.data?.items ?? [];
  const morningDone = !!cl?.morning_submitted_at;
  const nightDone = !!cl?.night_submitted_at;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["checklist"] });

  return (
    <PageShell
      eyebrow="Daily discipline"
      title="Today's Checklist"
      description="Plan in the morning. Tick through the day. Reflect at night."
    >
      <Tabs defaultValue="today" className="space-y-6">
        <TabsList>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <ChecklistPerformance enabled={!!user} />
        </TabsContent>

        <TabsContent value="today" className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Morning */}
        <Card className="border-amber-500/30">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Sun className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Morning plan</CardTitle>
            {morningDone && <Badge className="ml-auto bg-emerald-500/15 text-emerald-600">Submitted</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            {morningDone ? (
              <div className="space-y-2">
                {items.map((it: any) => (
                  <label key={it.id} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
                    <Checkbox
                      checked={Boolean(it.done ?? it.completed)}
                      onCheckedChange={async (v) => {
                        try {
                          await fetch("/api/checklist.php", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ action: "toggle_item", item_id: it.id, completed: v ? 1 : 0 }),
                          });
                        } catch {
                          try { await toggleItem({ data: { item_id: it.id, done: !!v } }); } catch {}
                        }
                        invalidate();
                      }}
                      className="mt-0.5"
                    />
                    <span className={"flex-1 text-sm " + ((it.done ?? it.completed) ? "text-muted-foreground line-through" : "")}>{it.text || it.task}</span>
                  </label>
                ))}
                {items.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Add the tasks you commit to today.</p>
                {newTasks.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={t}
                      placeholder={`Task ${idx + 1}`}
                      onChange={(e) => setNewTasks((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                    />
                    {newTasks.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => setNewTasks((p) => p.filter((_, i) => i !== idx))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setNewTasks((p) => [...p, ""])}>
                  <Plus className="mr-1 h-4 w-4" /> Add task
                </Button>
                <Button
                  className="w-full"
                  disabled={savingMorning || newTasks.every((t) => !t.trim())}
                  onClick={async () => {
                    const clean = newTasks.map((t) => t.trim()).filter(Boolean);
                    if (!clean.length) return;
                    setSavingMorning(true);
                    try {
                      const res = await fetch("/api/checklist.php", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ action: "submit_morning", tasks: clean, items: clean }),
                      });
                      if (!res.ok) throw new Error("Failed to save via API");
                      toast.success("Morning plan saved");
                      invalidate();
                    } catch {
                      try {
                        await submitMorning({ data: { items: clean } });
                        toast.success("Morning plan saved");
                        invalidate();
                      } catch (e: any) {
                        toast.error(e.message ?? "Failed to save morning plan");
                      }
                    } finally {
                      setSavingMorning(false);
                    }
                  }}
                >
                  {savingMorning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit morning plan
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Night */}
        <Card className="border-indigo-500/30">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Moon className="h-5 w-5 text-indigo-500" />
            <CardTitle className="text-lg">Night reflection</CardTitle>
            {nightDone && <Badge className="ml-auto bg-emerald-500/15 text-emerald-600">Submitted</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <Heart className="h-3.5 w-3.5" /> Good things of the day
              </label>
              <Textarea
                value={good}
                onChange={(e) => setGood(e.target.value)}
                rows={3}
                placeholder="What went well? Wins, insights, moments…"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                <CloudRain className="h-3.5 w-3.5" /> Regrets of the day
              </label>
              <Textarea
                value={regret}
                onChange={(e) => setRegret(e.target.value)}
                rows={3}
                placeholder="What would you do differently tomorrow?"
              />
            </div>
            <Button
              className="w-full"
              disabled={savingNight || !morningDone}
              onClick={async () => {
                setSavingNight(true);
                try {
                  await submitNight({ data: { good_things: good, regrets: regret } });
                  toast.success("Night reflection saved");
                  invalidate();
                } catch (e: any) {
                  toast.error(e.message ?? "Failed");
                } finally {
                  setSavingNight(false);
                }
              }}
            >
              {savingNight && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save reflection
            </Button>
            {!morningDone && (
              <p className="text-xs text-muted-foreground">Submit your morning plan first to unlock reflection.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {(() => {
                const days = (historyQ.data ?? []) as Array<{ id: string; date: string; items?: { done: boolean }[]; morning_submitted_at?: string | null; night_submitted_at?: string | null }>;
                const bars = [...days].reverse().map((d) => {
                  const total = d.items?.length ?? 0;
                  const done = (d.items ?? []).filter((i) => i.done).length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return { date: d.date.slice(5), pct, done, total };
                });
                const doneDays = bars.filter((b) => b.pct === 100).length;
                let streak = 0;
                for (let i = bars.length - 1; i >= 0; i--) { if (bars[i].pct === 100) streak++; else break; }
                const avg = bars.length ? Math.round(bars.reduce((s, b) => s + b.pct, 0) / bars.length) : 0;
                return (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-border p-2"><div className="text-lg font-extrabold text-emerald-600">{doneDays}</div><div className="text-[10px] uppercase text-muted-foreground">Full days</div></div>
                      <div className="rounded-lg border border-border p-2"><div className="text-lg font-extrabold text-orange-600">{streak}🔥</div><div className="text-[10px] uppercase text-muted-foreground">Current streak</div></div>
                      <div className="rounded-lg border border-border p-2"><div className="text-lg font-extrabold text-primary">{avg}%</div><div className="text-[10px] uppercase text-muted-foreground">Avg completion</div></div>
                    </div>
                    {bars.length > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <div className="mb-1 text-xs font-semibold text-muted-foreground">Completion trend</div>
                        <div className="flex h-24 items-end gap-1">
                          {bars.map((b, i) => (
                            <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${b.date}: ${b.done}/${b.total}`}>
                              <div className="flex w-full flex-1 items-end">
                                <div className={`w-full rounded-t ${b.pct === 100 ? "bg-emerald-500" : b.pct > 0 ? "bg-amber-400" : "bg-secondary"}`} style={{ height: `${Math.max(4, b.pct)}%` }} />
                              </div>
                              <div className="text-[8px] tabular-nums text-muted-foreground">{b.date}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="grid gap-3 sm:grid-cols-2">
                {(historyQ.data ?? []).map((d: any) => {
                  const total = d.items?.length ?? 0;
                  const done = (d.items ?? []).filter((i: any) => i.done).length;
                  return (
                    <div key={d.id} className="rounded-lg border border-border bg-card/50 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{d.date}</div>
                        <Badge variant="outline">{done}/{total}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {d.morning_submitted_at ? "☀️" : "·"} {d.night_submitted_at ? "🌙" : "·"}
                      </div>
                    </div>
                  );
                })}
                {(historyQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No history yet — today's the day.</p>}
              </div>
            </>
          )}
        </CardContent>

      </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
