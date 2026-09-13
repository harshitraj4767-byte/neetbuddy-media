import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAdminUser } from "@/lib/admin-bypass.server";

export type RunMode = "dpp" | "diagram";
const ALL_MODES: RunMode[] = ["dpp", "diagram"];

// ---- Helpers ----
async function getBonus(userId: string): Promise<number> {
  // Admins have effectively-infinite bonus.
  if (await isAdminUser(userId)) return Number.MAX_SAFE_INTEGER;
  const { data } = await supabaseAdmin.from("profiles").select("bonus_balance").eq("id", userId).maybeSingle();
  return Number((data as any)?.bonus_balance ?? 0);
}

async function loadCosts(): Promise<Record<RunMode, number>> {
  const { data } = await supabaseAdmin.from("app_settings" as never).select("key,value");
  const map = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ key: string; value: unknown }>) {
    const n = Number(r.value); if (Number.isFinite(n)) map.set(r.key, n);
  }
  return {
    dpp: map.get("infinite_run_dpp_cost") ?? 10,
    diagram: map.get("infinite_run_diagram_cost") ?? 15,
  };
}

// ---- Public: status ----
export const getInfiniteRunStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: run } = await supabaseAdmin
      .from("infinite_runs" as never)
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: events } = await supabaseAdmin
      .from("infinite_run_events" as never)
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const bonus = await getBonus(context.userId);
    const costs = await loadCosts();
    return { run: (run ?? null) as any, events: (events ?? []) as any[], bonus, costs };
  });

// ---- Start ----
export const startInfiniteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { modes?: RunMode[]; per_tick_count?: number }) =>
    z.object({
      modes: z.array(z.enum(["dpp", "diagram"])).min(1).max(2).optional(),
      per_tick_count: z.number().int().min(1).max(20).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const modes = data.modes && data.modes.length > 0 ? data.modes : (["dpp", "diagram"] as RunMode[]);
    const per_tick_count = data.per_tick_count ?? 5;
    const now = new Date().toISOString();

    // Upsert single row per user.
    const { data: existing } = await supabaseAdmin
      .from("infinite_runs" as never).select("id").eq("user_id", context.userId).maybeSingle();

    if (existing) {
      await supabaseAdmin.from("infinite_runs" as never).update({
        status: "running", modes, per_tick_count,
        last_error: null, stopped_at: null, updated_at: now,
      } as never).eq("user_id", context.userId);
    } else {
      await supabaseAdmin.from("infinite_runs" as never).insert({
        user_id: context.userId, status: "running",
        modes, per_tick_count, started_at: now, updated_at: now,
      } as never);
    }

    const { data: row } = await supabaseAdmin
      .from("infinite_runs" as never).select("*").eq("user_id", context.userId).maybeSingle();

    await supabaseAdmin.from("infinite_run_events" as never).insert({
      run_id: (row as any).id, user_id: context.userId, kind: "resumed", detail: { modes, per_tick_count },
    } as never);

    return { run: row as any };
  });

// ---- Pause / Stop ----
export const pauseInfiniteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin.from("infinite_runs" as never)
      .update({ status: "paused", updated_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const stopInfiniteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const now = new Date().toISOString();
    await supabaseAdmin.from("infinite_runs" as never)
      .update({ status: "stopped", stopped_at: now, updated_at: now } as never)
      .eq("user_id", context.userId);
    return { ok: true };
  });

// ---- Tick: run one cycle for one user. Returns what happened. ----
// Called by the client-side loop AND by the server cron.
export async function tickOneUser(userId: string): Promise<{ status: string; itemsGenerated: number; creditsSpent: number; mode?: string; error?: string }> {
  const { data: runRaw } = await supabaseAdmin
    .from("infinite_runs" as never).select("*").eq("user_id", userId).maybeSingle();
  const run = runRaw as any;
  if (!run || run.status !== "running") return { status: run?.status ?? "missing", itemsGenerated: 0, creditsSpent: 0 };

  const modes: RunMode[] = (run.modes ?? ["dpp"]).filter((m: string): m is RunMode => (ALL_MODES as string[]).includes(m));
  if (modes.length === 0) return { status: "running", itemsGenerated: 0, creditsSpent: 0 };

  // Round-robin: pick mode by tick count.
  const { count: evCount } = await supabaseAdmin
    .from("infinite_run_events" as never)
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("kind", "generated");
  const mode = modes[(evCount ?? 0) % modes.length];

  const costs = await loadCosts();
  const tickCost = 0; // Bonus removed — infinite run gated by feature entitlement.
  void costs;

  // Entitlement gate. Non-admins must have the infinite_run feature (Prime+).
  if (!(await isAdminUser(userId))) {
    try {
      const { requireFeature } = await import("@/lib/access.server");
      await requireFeature(userId, "infinite_run");
    } catch (e) {
      const now = new Date().toISOString();
      await supabaseAdmin.from("infinite_runs" as never)
        .update({ status: "exhausted", stopped_at: now, updated_at: now, last_error: (e as Error).message } as never)
        .eq("user_id", userId);
      return { status: "exhausted", itemsGenerated: 0, creditsSpent: 0 };
    }
  }

  // Dispatch one generation. We import the generator functions lazily.
  let itemsGenerated = 0;
  let runError: string | undefined;
  try {
    if (mode === "dpp") {
      const { generateAiDailyQuizzes } = await import("@/lib/ai-quiz.functions");
      const r = await (generateAiDailyQuizzes as any)({ data: { count: 1 } });
      itemsGenerated = Number((r as any)?.created ?? 1);
    } else if (mode === "diagram") {
      const { generateAiDiagramDpp } = await import("@/lib/ai-quiz.functions");
      const r = await (generateAiDiagramDpp as any)({ data: { count: run.per_tick_count ?? 5 } });
      itemsGenerated = Number((r as any)?.created ?? run.per_tick_count ?? 5);
    }
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
  }

  const charge = 0;
  void tickCost;

  const now = new Date().toISOString();
  await supabaseAdmin.from("infinite_runs" as never).update({
    last_tick_at: now,
    total_credits_spent: (run.total_credits_spent ?? 0) + charge,
    total_items_generated: (run.total_items_generated ?? 0) + itemsGenerated,
    last_error: runError ?? null,
    updated_at: now,
  } as never).eq("id", run.id);

  await supabaseAdmin.from("infinite_run_events" as never).insert({
    run_id: run.id, user_id: userId,
    kind: runError ? "error" : "generated",
    mode, items_generated: itemsGenerated, credits_spent: charge,
    detail: runError ? { error: runError } : null,
  } as never);

  return { status: "running", itemsGenerated, creditsSpent: charge, mode, error: runError };
}

// ---- Client-callable tick. Caller (signed in) ticks their own run. ----
export const tickInfiniteRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return tickOneUser(context.userId);
  });
