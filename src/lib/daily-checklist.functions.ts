import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function upsertChecklist(userId: string, date: string) {
  const db = await admin();
  const { data: existing } = await db
    .from("daily_checklist")
    .select("id, morning_submitted_at, night_submitted_at, good_things, regrets")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (existing) return existing;
  const { data: row, error } = await db
    .from("daily_checklist")
    .insert({ user_id: userId, date })
    .select("id, morning_submitted_at, night_submitted_at, good_things, regrets")
    .single();
  if (error) throw new Error(error.message);
  return row;
}

/** Get today (or a given date's) checklist for the current user. */
export const getMyChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ date: z.string().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const date = data.date ?? todayISO();
    const { data: cl } = await db
      .from("daily_checklist")
      .select("id, date, morning_submitted_at, night_submitted_at, good_things, regrets")
      .eq("user_id", context.userId)
      .eq("date", date)
      .maybeSingle();
    if (!cl) return { checklist: null, items: [] as any[] };
    const { data: items } = await db
      .from("daily_checklist_items")
      .select("id, text, done, done_at, order_idx")
      .eq("checklist_id", cl.id)
      .order("order_idx");
    return { checklist: cl, items: items ?? [] };
  });

/** Morning: replace today's tasks with the provided list. */
export const submitMorningChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      date: z.string().optional(),
      items: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const date = data.date ?? todayISO();
    const cl = await upsertChecklist(context.userId, date);
    // Replace items
    await db.from("daily_checklist_items").delete().eq("checklist_id", cl.id);
    const rows = data.items.map((text, idx) => ({
      checklist_id: cl.id,
      text,
      done: false,
      order_idx: idx,
    }));
    const { error: ierr } = await db.from("daily_checklist_items").insert(rows);
    if (ierr) throw new Error(ierr.message);
    const { error: uerr } = await db
      .from("daily_checklist")
      .update({ morning_submitted_at: new Date().toISOString() })
      .eq("id", cl.id);
    if (uerr) throw new Error(uerr.message);
    return { ok: true, checklist_id: cl.id };
  });

/** Toggle a single task done state. */
export const toggleChecklistItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ item_id: z.string().uuid(), done: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    // Verify ownership
    const { data: item } = await db
      .from("daily_checklist_items")
      .select("id, checklist_id, daily_checklist:daily_checklist!inner(user_id)")
      .eq("id", data.item_id)
      .maybeSingle();
    if (!item) throw new Error("Not found");
    // The nested join above may not work with service role easily; verify explicitly.
    const { data: cl } = await db
      .from("daily_checklist")
      .select("user_id")
      .eq("id", item.checklist_id)
      .maybeSingle();
    if (!cl || cl.user_id !== context.userId) throw new Error("Forbidden");
    const { error } = await db
      .from("daily_checklist_items")
      .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
      .eq("id", data.item_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Night: save good_things + regrets + mark night submitted. */
export const submitNightReflection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) =>
    z.object({
      date: z.string().optional(),
      good_things: z.string().max(3000).optional().nullable(),
      regrets: z.string().max(3000).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const date = data.date ?? todayISO();
    const cl = await upsertChecklist(context.userId, date);
    const { error } = await db
      .from("daily_checklist")
      .update({
        good_things: data.good_things ?? null,
        regrets: data.regrets ?? null,
        night_submitted_at: new Date().toISOString(),
      })
      .eq("id", cl.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Recent checklist history for the current user. */
export const listMyChecklistHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ days: z.number().int().min(1).max(60).default(14) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - data.days);
    const { data: rows } = await db
      .from("daily_checklist")
      .select("id, date, morning_submitted_at, night_submitted_at, good_things, regrets")
      .eq("user_id", context.userId)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });
    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: items } = ids.length
      ? await db.from("daily_checklist_items").select("id, checklist_id, text, done, order_idx").in("checklist_id", ids).order("order_idx")
      : { data: [] as any[] };
    const byCl: Record<string, any[]> = {};
    for (const it of items ?? []) (byCl[it.checklist_id] ||= []).push(it);
    return (rows ?? []).map((r: any) => ({ ...r, items: byCl[r.id] ?? [] }));
  });

// ---------------------------------------------------------------------------
// Performance analytics
// ---------------------------------------------------------------------------
type DayRow = {
  date: string;
  planned: number;
  done: number;
  pct: number;
  morning_at: string | null;
  night_at: string | null;
  reflected: boolean;
};

function emptyAgg() {
  return { days: 0, active_days: 0, planned: 0, done: 0, pct: 0, perfect_days: 0, reflections: 0 };
}

function aggregate(rows: DayRow[]) {
  const a = emptyAgg();
  a.days = rows.length;
  for (const r of rows) {
    if (r.planned > 0) a.active_days += 1;
    a.planned += r.planned;
    a.done += r.done;
    if (r.planned > 0 && r.done === r.planned) a.perfect_days += 1;
    if (r.reflected) a.reflections += 1;
  }
  a.pct = a.planned ? Math.round((a.done / a.planned) * 100) : 0;
  return a;
}

function istHour(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime() + 5.5 * 3600000;
  const d = new Date(t);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}

/** Full performance snapshot: daily / weekly / monthly comparisons, streaks, habits. */
export const getChecklistAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i) => z.object({ days: z.number().int().min(30).max(180).default(90) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const span = data.days;
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (span - 1));
    const startISO = start.toISOString().slice(0, 10);

    const { data: cls } = await db
      .from("daily_checklist")
      .select("id, date, morning_submitted_at, night_submitted_at, good_things, regrets")
      .eq("user_id", context.userId)
      .gte("date", startISO)
      .order("date", { ascending: true });

    const ids = (cls ?? []).map((c: any) => c.id);
    const { data: items } = ids.length
      ? await db.from("daily_checklist_items").select("checklist_id, text, done, done_at").in("checklist_id", ids)
      : { data: [] as any[] };

    const byCl: Record<string, any[]> = {};
    for (const it of items ?? []) (byCl[it.checklist_id] ||= []).push(it);

    const rowByDate: Record<string, DayRow> = {};
    for (const c of cls ?? []) {
      const its = byCl[c.id] ?? [];
      const planned = its.length;
      const done = its.filter((i: any) => i.done).length;
      rowByDate[c.date] = {
        date: c.date,
        planned,
        done,
        pct: planned ? Math.round((done / planned) * 100) : 0,
        morning_at: c.morning_submitted_at ?? null,
        night_at: c.night_submitted_at ?? null,
        reflected: !!c.night_submitted_at,
      };
    }

    // Dense series so charts never have gaps.
    const series: DayRow[] = [];
    for (let i = 0; i < span; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push(
        rowByDate[key] ?? { date: key, planned: 0, done: 0, pct: 0, morning_at: null, night_at: null, reflected: false },
      );
    }

    const last = (n: number, offset = 0) => series.slice(Math.max(0, series.length - n - offset), series.length - offset);
    const today = series[series.length - 1];
    const yesterday = series[series.length - 2] ?? null;

    const periods = {
      today: { current: aggregate([today]), previous: aggregate(yesterday ? [yesterday] : []) },
      week: { current: aggregate(last(7)), previous: aggregate(last(7, 7)) },
      month: { current: aggregate(last(30)), previous: aggregate(last(30, 30)) },
    };

    // Streaks over days that had a plan.
    let current = 0;
    for (let i = series.length - 1; i >= 0; i--) {
      const r = series[i];
      if (r.planned > 0 && r.done === r.planned) current += 1;
      else if (i === series.length - 1 && r.planned === 0) continue; // today not planned yet
      else break;
    }
    let best = 0;
    let run = 0;
    for (const r of series) {
      if (r.planned > 0 && r.done === r.planned) { run += 1; best = Math.max(best, run); } else run = 0;
    }

    // Weekday habits (0 = Sunday).
    const weekday = Array.from({ length: 7 }, () => ({ planned: 0, done: 0, days: 0 }));
    for (const r of series) {
      if (r.planned === 0) continue;
      const w = new Date(r.date + "T00:00:00Z").getUTCDay();
      weekday[w].planned += r.planned;
      weekday[w].done += r.done;
      weekday[w].days += 1;
    }

    // Punctuality: how early the plan is set and the reflection written (IST).
    const morningHours = series.map((r) => istHour(r.morning_at)).filter((h): h is number => h !== null);
    const nightHours = series.map((r) => istHour(r.night_at)).filter((h): h is number => h !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const avgMorning = avg(morningHours);
    const avgNight = avg(nightHours);
    const punctuality = avgMorning === null ? 0 : Math.round(Math.max(0, Math.min(1, (11 - avgMorning) / 4)) * 100);

    // Recurring tasks that keep slipping.
    const taskStats: Record<string, { text: string; planned: number; done: number }> = {};
    for (const it of items ?? []) {
      const key = String(it.text).trim().toLowerCase().slice(0, 120);
      const s = (taskStats[key] ||= { text: String(it.text).trim(), planned: 0, done: 0 });
      s.planned += 1;
      if (it.done) s.done += 1;
    }
    const recurring = Object.values(taskStats)
      .filter((t) => t.planned >= 2)
      .map((t) => ({ ...t, pct: Math.round((t.done / t.planned) * 100) }))
      .sort((a, b) => a.pct - b.pct || b.planned - a.planned)
      .slice(0, 6);

    const month = periods.month.current;
    const consistency = Math.round((month.active_days / 30) * 100);
    const reflectionRate = month.active_days ? Math.round((month.reflections / month.active_days) * 100) : 0;
    const discipline = Math.round(
      Math.min(100, month.pct * 0.45 + consistency * 0.3 + punctuality * 0.15 + reflectionRate * 0.1),
    );

    return {
      series: series.map((r) => ({ date: r.date, planned: r.planned, done: r.done, pct: r.pct, reflected: r.reflected })),
      periods,
      streak: { current, best },
      weekday,
      punctuality,
      avg_morning_hour: avgMorning,
      avg_night_hour: avgNight,
      consistency,
      reflection_rate: reflectionRate,
      discipline,
      recurring,
    };
  });
