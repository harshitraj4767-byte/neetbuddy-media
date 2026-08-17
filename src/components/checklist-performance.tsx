import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Target,
  Clock,
  CalendarCheck,
  Moon,
  Gauge,
  AlertTriangle,
} from "lucide-react";
import { getChecklistAnalytics } from "@/lib/daily-checklist.functions";

type Period = "today" | "week" | "month";

const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "This week", month: "This month" };
const PREV_LABEL: Record<Period, string> = { today: "yesterday", week: "last week", month: "last month" };

function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const tone = value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Target;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function hourLabel(h: number | null): string {
  if (h === null) return "—";
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ChecklistPerformance({ enabled }: { enabled: boolean }) {
  const fn = useServerFn(getChecklistAnalytics);
  const q = useQuery({
    queryKey: ["checklist", "analytics"],
    queryFn: () => fn({ data: { days: 90 } }),
    enabled,
  });
  const [period, setPeriod] = useState<Period>("week");

  const d = q.data;
  const windowDays = period === "today" ? 14 : period === "week" ? 28 : 90;
  const bars = useMemo(() => (d ? d.series.slice(-windowDays) : []), [d, windowDays]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Crunching your numbers…
      </div>
    );
  }
  if (!d) return <p className="p-6 text-sm text-muted-foreground">No data yet — plan your first day to unlock analytics.</p>;

  const cur = d.periods[period].current;
  const prev = d.periods[period].previous;
  const pctDelta = cur.pct - prev.pct;
  const doneDelta = cur.done - prev.done;
  const activeDelta = cur.active_days - prev.active_days;

  const maxWeekday = Math.max(1, ...d.weekday.map((w) => (w.planned ? Math.round((w.done / w.planned) * 100) : 0)));

  return (
    <div className="space-y-6">
      {/* Discipline score */}
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="flex items-center gap-4">
            <div className="relative grid h-24 w-24 place-items-center rounded-full bg-secondary">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(var(--primary) ${d.discipline * 3.6}deg, var(--muted) 0deg)`,
                }}
              />
              <div className="absolute inset-[6px] rounded-full bg-card" />
              <div className="relative text-center">
                <div className="text-2xl font-extrabold tabular-nums">{d.discipline}</div>
                <div className="text-[10px] uppercase text-muted-foreground">/ 100</div>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">Discipline score</div>
              <p className="max-w-xs text-xs text-muted-foreground">
                Completion 45% · Consistency 30% · Punctuality 15% · Reflection 10%, over the last 30 days.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Completion", value: d.periods.month.current.pct },
              { label: "Consistency", value: d.consistency },
              { label: "Punctuality", value: d.punctuality },
              { label: "Reflection", value: d.reflection_rate },
            ].map((m) => (
              <div key={m.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-semibold tabular-nums">{m.value}%</span>
                </div>
                <Progress value={m.value} className="h-1.5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Period comparison */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Performance snapshot</CardTitle>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="today">Daily</TabsTrigger>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="month">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Target}
              label={`${PERIOD_LABEL[period]} completion`}
              value={`${cur.pct}%`}
              sub={<span>
                <Delta value={pctDelta} /> vs {PREV_LABEL[period]}
              </span>}
            />
            <Stat
              icon={CalendarCheck}
              label="Tasks done"
              value={`${cur.done}/${cur.planned}`}
              sub={<span>
                <Delta value={doneDelta} suffix="" /> vs {PREV_LABEL[period]}
              </span>}
            />
            <Stat
              icon={Gauge}
              label="Active days"
              value={period === "today" ? (cur.active_days ? "Planned" : "Not planned") : `${cur.active_days}/${cur.days}`}
              sub={period === "today" ? undefined : <span>
                <Delta value={activeDelta} suffix="" /> vs {PREV_LABEL[period]}
              </span>}
            />
            <Stat
              icon={Flame}
              label="Perfect days"
              value={cur.perfect_days}
              sub={`Streak ${d.streak.current} · best ${d.streak.best}`}
            />
          </div>

          {/* Trend */}
          <div className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Completion trend · last {windowDays} days</span>
              <span className="text-xs text-muted-foreground">
                Avg {Math.round(bars.reduce((s, b) => s + b.pct, 0) / Math.max(1, bars.length))}%
              </span>
            </div>
            <div className="flex h-28 items-end gap-[3px]">
              {bars.map((b) => (
                <div
                  key={b.date}
                  className="relative flex h-full flex-1 items-end overflow-hidden rounded-md bg-secondary/60"
                  title={`${b.date}: ${b.done}/${b.planned} (${b.pct}%)`}
                >
                  <div
                    className={`w-full rounded-md transition-all ${
                      b.planned === 0
                        ? "bg-border"
                        : b.pct === 100
                          ? "bg-emerald-500"
                          : b.pct >= 60
                            ? "bg-primary"
                            : "bg-amber-400"
                    }`}
                    style={{ height: b.planned === 0 ? "6%" : `${Math.max(8, b.pct)}%` }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{bars[0]?.date}</span>
              <span>{bars[bars.length - 1]?.date}</span>
            </div>
          </div>

          {/* Weekday rhythm + timing */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border p-4">
              <div className="mb-3 text-xs font-semibold text-muted-foreground">Weekday rhythm</div>
              <div className="space-y-2">
                {d.weekday.map((w, i) => {
                  const pct = w.planned ? Math.round((w.done / w.planned) * 100) : 0;
                  const isBest = pct === maxWeekday && pct > 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-9 text-xs text-muted-foreground">{WEEKDAYS[i]}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${isBest ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold tabular-nums">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Average planning time
                </div>
                <div className="mt-1 text-xl font-extrabold">{hourLabel(d.avg_morning_hour)}</div>
                <p className="text-xs text-muted-foreground">
                  Planning before 7 AM scores full punctuality points.
                </p>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Moon className="h-3.5 w-3.5" /> Average reflection time
                </div>
                <div className="mt-1 text-xl font-extrabold">{hourLabel(d.avg_night_hour)}</div>
                <p className="text-xs text-muted-foreground">
                  You reflected on {d.reflection_rate}% of your planned days.
                </p>
              </div>
            </div>
          </div>

          {/* Recurring tasks */}
          {d.recurring.length > 0 && (
            <div className="rounded-2xl border border-border p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Habits that need attention
              </div>
              <div className="space-y-2">
                {d.recurring.map((t) => (
                  <div key={t.text} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.text}</span>
                    <Badge variant={t.pct >= 80 ? "secondary" : "outline"} className="tabular-nums">
                      {t.done}/{t.planned} · {t.pct}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
