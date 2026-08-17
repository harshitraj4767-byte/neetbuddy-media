import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [users, questions, subjects, paidTests, txns, paidOrders, subjectsList, recentActions, recentBugs, cronRuns] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("questions").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("subjects").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("tests").select("id", { count: "exact", head: true }).eq("is_paid", true),
      supabaseAdmin.from("wallet_transactions").select("amount,type,created_at").eq("type", "recharge").eq("status", "completed"),
      supabaseAdmin.from("payment_orders").select("amount,status,created_at").in("status", ["paid", "completed"]),
      supabaseAdmin.from("subjects").select("id,name,color"),
      supabaseAdmin.from("admin_actions").select("id,action,target,meta,created_at,user_id").order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("bug_reports").select("id,title,severity,status,created_at").order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("cron_job_runs").select("id,job_name,status,details,created_at").order("created_at", { ascending: false }).limit(10),
    ]);

    // Revenue = wallet recharges + completed subscription / one-off payment orders.
    const txnTotal = (txns.data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const ordersTotal = (paidOrders.data ?? []).reduce((s, r) => s + Number((r as any).amount || 0), 0);
    const totalRevenue = txnTotal + ordersTotal;

    // last 30 days revenue series
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (29 - i));
      return { date: d.toISOString().slice(0, 10), revenue: 0 };
    });
    const accrue = (rows: Array<{ amount: number | string; created_at: string }>) => {
      for (const r of rows) {
        const k = (r.created_at as string).slice(0, 10);
        const day = days.find((x) => x.date === k);
        if (day) day.revenue += Number(r.amount || 0);
      }
    };
    accrue((txns.data ?? []) as any);
    accrue((paidOrders.data ?? []) as any);


    // questions by subject
    const subjectIds = (subjectsList.data ?? []).map((s) => s.id);
    const bySubject: { name: string; color: string | null; count: number }[] = [];
    for (const s of subjectsList.data ?? []) {
      const { count } = await supabaseAdmin
        .from("questions").select("id", { count: "exact", head: true }).eq("subject_id", s.id);
      bySubject.push({ name: s.name, color: s.color, count: count ?? 0 });
    }
    void subjectIds;

    // ── Premium users breakdown ────────────────────────────────────────────
    // Active = status 'active' and not yet expired. Admin-granted rows carry
    // `granted_by`; everything else is treated as a purchase.
    const nowIso = new Date().toISOString();
    const { data: activeSubs } = await (supabaseAdmin as any)
      .from("subscriptions")
      .select("user_id,plan,source,granted_by,started_at,expires_at")
      .eq("status", "active")
      .gt("expires_at", nowIso);

    const subRows = (activeSubs ?? []) as Array<{
      user_id: string; plan: string; source: string | null;
      granted_by: string | null; started_at: string; expires_at: string;
    }>;

    // Latest row wins per user so a purchase upgrade isn't double counted.
    const perUser = new Map<string, (typeof subRows)[number]>();
    for (const r of subRows) {
      const prev = perUser.get(r.user_id);
      if (!prev || new Date(r.started_at) > new Date(prev.started_at)) perUser.set(r.user_id, r);
    }
    const uniq = [...perUser.values()];
    const grantedRows = uniq.filter((r) => !!r.granted_by);
    const purchasedRows = uniq.filter((r) => !r.granted_by);

    const emailIds = [...new Set([
      ...uniq.map((r) => r.user_id),
      ...grantedRows.map((r) => r.granted_by!),
    ])];
    const emailMap = new Map<string, string>();
    if (emailIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id,email,full_name").in("id", emailIds);
      for (const p of (profs ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>) {
        emailMap.set(p.id, p.email ?? p.full_name ?? p.id);
      }
    }

    const premium = {
      total: uniq.length,
      purchased: purchasedRows.length,
      granted: grantedRows.length,
      grantedUsers: grantedRows
        .map((r) => ({
          email: emailMap.get(r.user_id) ?? r.user_id,
          plan: r.plan,
          expiresAt: r.expires_at,
          grantedByEmail: emailMap.get(r.granted_by!) ?? r.granted_by!,
        }))
        .sort((a, b) => a.email.localeCompare(b.email)),
      purchasedUsers: purchasedRows
        .map((r) => ({ email: emailMap.get(r.user_id) ?? r.user_id, plan: r.plan, expiresAt: r.expires_at }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    };

    return {
      totals: {
        users: users.count ?? 0,
        questions: questions.count ?? 0,
        subjects: subjects.count ?? 0,
        paidTests: paidTests.count ?? 0,
        revenue: totalRevenue,
      },
      premium,
      bySubject,
      revenueSeries: days,
      recentActions: recentActions.data ?? [],
      recentBugs: recentBugs.data ?? [],
      cronRuns: cronRuns.data ?? [],
    };
  });

