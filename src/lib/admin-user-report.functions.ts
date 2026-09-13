// Admin User Report — look up a user by email and return everything we know:
// balances, wallet transactions, battle stats, deposits, withdrawals, payments,
// referrals, subscriptions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as typedAdmin } from "@/integrations/supabase/client.server";

// Cast away: some tables (battle_*, subscriptions, withdrawal_requests) and a
// few profile columns (referred_by, referral_code) aren't in the generated
// Database types yet but exist in the live schema.
const supabaseAdmin = typedAdmin as any;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getUserReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ email: z.string().trim().min(3) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const email = data.email.trim().toLowerCase();

    // 1. Find profile by email (case-insensitive).
    let { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .ilike("email", email)
      .maybeSingle();

    // Fallback: look up via auth.users (in case profile.email was never populated).
    let authUser: any = null;
    if (!profile) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = list?.users?.find((x) => (x.email ?? "").toLowerCase() === email);
      if (u) {
        authUser = u;
        const { data: p2 } = await supabaseAdmin.from("profiles").select("*").eq("id", u.id).maybeSingle();
        profile = p2 ?? null;
      }
    }
    if (!profile) throw new Error(`No user found with email ${email}`);

    // Always pull auth user (for suspended/banned flag).
    if (!authUser) {
      const { data: au } = await supabaseAdmin.auth.admin.getUserById(profile.id);
      authUser = au?.user ?? null;
    }
    const suspended = !!(authUser?.banned_until && new Date(authUser.banned_until).getTime() > Date.now())
      || !!authUser?.app_metadata?.suspended;

    const userId = profile.id as string;

    // 2. Fetch related data in parallel.
    const [txns, battles, players, orders, withdrawals, attempts, refIn, refOut, roles, sub] = await Promise.all([
      supabaseAdmin
        .from("wallet_transactions")
        .select("id,amount,type,bucket,status,reference,created_at,meta")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      // Matches the user has joined as a real player.
      supabaseAdmin
        .from("battle_match_players")
        .select("match_id,score,submitted_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      // Self join not needed; we'll fetch match rows in a second query.
      Promise.resolve(null),
      supabaseAdmin
        .from("payment_orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("withdrawal_requests")
        .select("id,amount,status,upi_or_note,created_at,processed_at,admin_note")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50)
        .then((r) => r, () => ({ data: [] as any[] })),
      supabaseAdmin
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId),
      supabaseAdmin.from("profiles").select("id,full_name,email").eq("id", profile.referred_by ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r, () => ({ data: null })),
    ]);

    // 3. Pull match details for the joined matches.
    const matchIds = (battles.data ?? []).map((b: any) => b.match_id);
    let matchMap = new Map<string, any>();
    if (matchIds.length) {
      const { data: matches } = await supabaseAdmin
        .from("battle_matches")
        .select("id,stake,status,winner_user_id,prize_amount,is_bot_match,bot_name,bot_score,started_at,ends_at")
        .in("id", matchIds);
      matchMap = new Map((matches ?? []).map((m: any) => [m.id, m]));
    }

    // 4. Battle stats.
    let played = 0, won = 0, lost = 0, tied = 0, abandoned = 0;
    let stakeIn = 0, prizeOut = 0;
    const byStake: Record<string, { played: number; won: number }> = {};
    for (const p of (battles.data ?? []) as any[]) {
      const m = matchMap.get(p.match_id);
      if (!m) continue;
      if (m.status !== "finished") { abandoned++; continue; }
      played++;
      const stake = Number(m.stake ?? 0);
      stakeIn += stake;
      const key = stake === 0 ? "free" : `₹${stake}`;
      byStake[key] ??= { played: 0, won: 0 };
      byStake[key].played++;
      // Bot matches never store winner_user_id when the bot wins (bots have
      // no user_id), so winner_user_id=NULL can mean tie OR bot win.
      // Decide by comparing scores for bot matches; use winner_user_id for human matches.
      const myScore = Number(p.score ?? 0);
      const oppScore = Number(m.bot_score ?? 0);
      const isBot = !!m.is_bot_match;
      const isWin = isBot ? (myScore > oppScore) : (m.winner_user_id === userId);
      const isTie = isBot ? (myScore === oppScore) : (m.winner_user_id == null);
      if (isWin) {
        won++;
        byStake[key].won++;
        prizeOut += Number(m.prize_amount ?? 0);
      } else if (isTie) {
        tied++;
      } else {
        lost++;
      }
    }

    // 5. Wallet money flow aggregates from transactions.
    const sumByType: Record<string, number> = {};
    let totalIn = 0, totalOut = 0;
    for (const t of (txns.data ?? []) as any[]) {
      if (t.status !== "completed") continue;
      const amt = Number(t.amount || 0);
      sumByType[t.type] = (sumByType[t.type] ?? 0) + amt;
      if (amt >= 0) totalIn += amt;
      else totalOut += amt;
    }
    const totalDeposits = (orders.data ?? []).filter((o: any) => o.status === "paid" || o.status === "completed").reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
    const totalWithdrawn = ((withdrawals as any).data ?? []).filter((w: any) => w.status === "paid" || w.status === "completed").reduce((s: number, w: any) => s + Number(w.amount || 0), 0);

    return {
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        xp_total: profile.xp_total,
        wallet_balance: Number(profile.wallet_balance ?? 0),
        deposit_balance: Number(profile.deposit_balance ?? 0),
        winnings_balance: Number(profile.winnings_balance ?? 0),
        bonus_balance: Number(profile.bonus_balance ?? 0),
        referral_code: profile.referral_code,
        referred_by: profile.referred_by,
        referred_by_user: (refOut as any).data ?? null,
        created_at: profile.created_at,
        roles: ((roles as any).data ?? []).map((r: any) => r.role),
        suspended,
        banned_until: authUser?.banned_until ?? null,
      },
      money: {
        total_deposits: totalDeposits,
        total_withdrawn: totalWithdrawn,
        total_credit_txn: totalIn,
        total_debit_txn: totalOut,
        sum_by_type: sumByType,
      },
      battles: {
        played, won, lost, tied, abandoned,
        win_rate: played ? Math.round((won / played) * 1000) / 10 : 0,
        stake_paid: stakeIn,
        prize_received: prizeOut,
        net_battle: prizeOut - stakeIn,
        by_stake: byStake,
      },
      counts: {
        test_attempts: attempts.count ?? 0,
        referrals_made: refIn.count ?? 0,
      },
      subscription: (sub as any).data ?? null,
      recent_transactions: (txns.data ?? []).slice(0, 25),
      recent_orders: orders.data ?? [],
      recent_withdrawals: (withdrawals as any).data ?? [],
      recent_battles: (battles.data ?? []).slice(0, 25).map((b: any) => {
        const m = matchMap.get(b.match_id);
        return {
          match_id: b.match_id,
          score: b.score,
          submitted_at: b.submitted_at,
          created_at: b.created_at,
          stake: m?.stake ?? null,
          status: m?.status ?? null,
          is_bot_match: m?.is_bot_match ?? null,
          bot_name: m?.bot_name ?? null,
          bot_score: m?.bot_score ?? null,
          winner_user_id: m?.winner_user_id ?? null,
          prize_amount: m?.prize_amount ?? null,
          you_won: m?.winner_user_id === userId,
        };
      }),
    };
  });
