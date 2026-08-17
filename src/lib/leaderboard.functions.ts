import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getLeaderboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,xp_total")
      .order("xp_total", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);

    const { data: me, error: meError } = await supabaseAdmin
      .from("profiles")
      .select("xp_total")
      .eq("id", context.userId)
      .maybeSingle();
    if (meError) throw new Error(meError.message);

    let myRank: number | null = null;
    if (me) {
      const { count, error: rankError } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("xp_total", me.xp_total ?? 0);
      if (rankError) throw new Error(rankError.message);
      myRank = (count ?? 0) + 1;
    }

    return {
      rows: (rows ?? []).map((row) => ({ ...row, email: null as string | null })),
      myRank,
    };
  });

// Compute current daily streak per user from completed attempts in the last
// 60 days, then return the top streakers + the caller's streak/rank.
export const getStreakLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    since.setHours(0, 0, 0, 0);

    const { data: rawAttempts, error: aErr } = await supabaseAdmin
      .from("attempts")
      .select("user_id,submitted_at")
      .eq("status", "completed")
      .gte("submitted_at", since.toISOString())
      .not("submitted_at", "is", null);
    if (aErr) throw new Error(aErr.message);

    // Group dates per user.
    const byUser = new Map<string, Set<string>>();
    for (const row of rawAttempts ?? []) {
      const uid = (row as any).user_id as string;
      const s = (row as any).submitted_at as string | null;
      if (!uid || !s) continue;
      const day = new Date(s).toISOString().slice(0, 10);
      let set = byUser.get(uid);
      if (!set) { set = new Set(); byUser.set(uid, set); }
      set.add(day);
    }

    function streakFor(days: Set<string>): number {
      let s = 0;
      const cur = new Date(); cur.setHours(0, 0, 0, 0);
      if (!days.has(cur.toISOString().slice(0, 10))) {
        cur.setDate(cur.getDate() - 1);
      }
      while (days.has(cur.toISOString().slice(0, 10))) {
        s++;
        cur.setDate(cur.getDate() - 1);
      }
      return s;
    }

    const streaks: { user_id: string; streak: number }[] = [];
    for (const [uid, set] of byUser) {
      const s = streakFor(set);
      if (s > 0) streaks.push({ user_id: uid, streak: s });
    }
    streaks.sort((a, b) => b.streak - a.streak);

    const top = streaks.slice(0, 100);
    const ids = top.map((r) => r.user_id);

    let profiles: Record<string, { full_name: string | null }> = {};
    if (ids.length > 0) {
      const { data: pRows } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", ids);
      profiles = Object.fromEntries((pRows ?? []).map((p: any) => [p.id, { full_name: p.full_name }]));
    }

    const rows = top.map((r) => ({
      id: r.user_id,
      full_name: profiles[r.user_id]?.full_name ?? null,
      streak: r.streak,
    }));

    const myStreak = streakFor(byUser.get(context.userId) ?? new Set());
    let myRank: number | null = null;
    if (myStreak > 0) {
      myRank = streaks.findIndex((s) => s.user_id === context.userId) + 1 || null;
    }

    return { rows, myStreak, myRank };
  });
