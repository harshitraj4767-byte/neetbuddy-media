import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Square, Infinity as InfinityIcon, Sparkles, Coins, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  getInfiniteRunStatus, startInfiniteRun, pauseInfiniteRun, stopInfiniteRun, tickInfiniteRun,
} from "@/lib/infinite-run.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/infinite-run")({
  head: () => ({ meta: [{ title: "Infinite Run — Neet Buddy" }] }),
  component: InfiniteRunPage,
});

type Status = Awaited<ReturnType<typeof getInfiniteRunStatus>>;

const MODE_LABEL: Record<string, string> = {
  dpp: "AI DPP",
  diagram: "Diagram DPP",
};

function InfiniteRunPage() {
  const { user, loading, isAdmin, refresh } = useAuth();
  const nav = useNavigate();
  const get = useServerFn(getInfiniteRunStatus);
  const start = useServerFn(startInfiniteRun);
  const pause = useServerFn(pauseInfiniteRun);
  const stop = useServerFn(stopInfiniteRun);
  const tick = useServerFn(tickInfiniteRun);

  const [state, setState] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"start" | "pause" | "stop" | null>(null);
  const ticking = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) nav({ to: "/login" });
    else if (!isAdmin) nav({ to: "/dashboard" });
  }, [user, loading, isAdmin, nav]);

  const refreshStatus = useCallback(async () => {
    try { setState(await get()); } catch {/* ignore */}
  }, [get]);

  useEffect(() => { if (user) refreshStatus(); }, [user?.id, refreshStatus]);

  // Client-side loop: while running, tick every 30s. Server cron continues in background regardless.
  useEffect(() => {
    if (!state?.run || state.run.status !== "running") return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (ticking.current || cancelled) return;
      ticking.current = true;
      try {
        const r = await tick();
        if ((r as any).status === "exhausted") toast.info("Out of bonus credits — run stopped.");
        await refreshStatus();
        await refresh();
      } catch (e: any) {
        toast.error(e?.message ?? "Tick failed");
      } finally {
        ticking.current = false;
      }
    }, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [state?.run?.status, state?.run?.id, tick, refreshStatus, refresh]);

  const onStart = async () => {
    setBusy("start");
    try {
      await start({ data: {} });
      toast.success("Infinite Run started. Generating in the background…");
      await refreshStatus();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  };
  const onPause = async () => {
    setBusy("pause");
    try { await pause({}); await refreshStatus(); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  };
  const onStop = async () => {
    if (!confirm("Stop the run? You can start a new one later.")) return;
    setBusy("stop");
    try { await stop({}); await refreshStatus(); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  };
  const onTickNow = async () => {
    setBusy("start");
    try {
      const r = await tick();
      toast.success(`Generated ${(r as any).itemsGenerated} item(s), −${(r as any).creditsSpent} bonus`);
      await refreshStatus();
      await refresh();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  };

  if (loading || !user || !state) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const run = state.run;
  const isRunning = run?.status === "running";
  const isExhausted = run?.status === "exhausted";

  return (
    <PageShell eyebrow="Beta · Auto-Generator" title="Infinite Run" description="Click Start and the app keeps generating fresh AI DPPs in the background — until your bonus credits run out. The server keeps going even after you close this tab.">
      {/* Hero card */}
      <Card className="mb-4 border-2 border-primary/30 bg-gradient-to-br from-primary via-primary to-blue-700 text-primary-foreground shadow-elegant">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <InfinityIcon className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest opacity-90">Infinite Run</div>
              <div className="text-xl font-extrabold leading-tight">
                {isRunning ? "Running…" : isExhausted ? "Exhausted" : run?.status === "paused" ? "Paused" : "Idle"}
              </div>
              <div className="mt-0.5 text-xs opacity-90">
                {state.bonus} bonus available · ~{Math.max(0, Math.floor(state.bonus / Math.max(1, Math.min(...Object.values(state.costs)))))} more ticks
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider opacity-80">Items generated</div>
              <div className="text-lg font-extrabold">{run?.total_items_generated ?? 0}</div>
            </div>
            <div className="rounded-xl bg-white/15 p-2.5 backdrop-blur">
              <div className="text-[10px] uppercase tracking-wider opacity-80">Credits spent</div>
              <div className="text-lg font-extrabold">−{run?.total_credits_spent ?? 0}</div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            {!isRunning && (
              <Button onClick={onStart} disabled={busy !== null || state.bonus < 1} variant="secondary" className="flex-1 bg-white text-primary hover:bg-white/90">
                {busy === "start" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
                {run ? "Resume" : "Start"}
              </Button>
            )}
            {isRunning && (
              <>
                <Button onClick={onPause} disabled={busy !== null} variant="secondary" className="flex-1 bg-white/90 text-primary hover:bg-white">
                  {busy === "pause" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Pause className="mr-1 h-4 w-4" />} Pause
                </Button>
                <Button onClick={onTickNow} disabled={busy !== null} variant="secondary" className="flex-1 bg-white/15 text-white hover:bg-white/25">
                  <Zap className="mr-1 h-4 w-4" /> Tick now
                </Button>
              </>
            )}
            {run && run.status !== "stopped" && (
              <Button onClick={onStop} disabled={busy !== null} variant="outline" size="icon" className="border-white/40 bg-transparent text-white hover:bg-white/10">
                {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="mb-4 border border-border bg-gradient-to-br from-card to-secondary/40 shadow-soft">
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> How it works
          </div>
          <ul className="space-y-1.5 text-foreground/80">
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> Client ticks every 30s while this tab is open.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> Server cron keeps generating in the background even after you close it.</li>
            <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> Each tick rotates: AI DPP ({state.costs.dpp} bonus) → Diagram DPP ({state.costs.diagram} bonus).</li>
            <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> Auto-stops the moment your bonus balance drops below the next tick cost.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Mode chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(run?.modes ?? ["dpp", "diagram"]).map((m: string) => (
          <Badge key={m} variant="secondary" className="border border-primary/20 bg-primary/10 text-primary">
            {MODE_LABEL[m] ?? m} · {state.costs[m as "dpp" | "diagram"] ?? "?"} <Coins className="ml-0.5 h-3 w-3" />
          </Badge>
        ))}
      </div>

      {/* Activity feed */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Recent activity</div>
        {run?.last_tick_at && (
          <div className="text-[10px] text-muted-foreground">Last tick: {new Date(run.last_tick_at).toLocaleTimeString()}</div>
        )}
      </div>
      <div className="space-y-1.5">
        {state.events.length === 0 && <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No activity yet. Start the run to see ticks appear here.</div>}
        {state.events.map((ev) => (
          <div key={ev.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
            <div className={`h-2 w-2 rounded-full ${
              ev.kind === "generated" ? "bg-emerald-500" :
              ev.kind === "error" ? "bg-rose-500" :
              ev.kind === "exhausted" ? "bg-amber-500" : "bg-sky-500"
            }`} />
            <div className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{ev.kind === "generated" ? `+${ev.items_generated} ${MODE_LABEL[ev.mode ?? ""] ?? ev.mode ?? ""}` : ev.kind}</span>
              {ev.credits_spent > 0 && <span className="ml-1 text-muted-foreground">−{ev.credits_spent} bonus</span>}
              {ev.detail?.error && <span className="ml-1 text-rose-500">· {String(ev.detail.error).slice(0, 60)}</span>}
            </div>
            <div className="shrink-0 text-[10px] text-muted-foreground">{new Date(ev.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
