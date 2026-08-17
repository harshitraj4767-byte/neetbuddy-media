// Server-only helpers to enforce free-trial usage limits.
// Trial users only. Admins, paid subscribers, and mentors bypass all checks.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAccessForUser } from "@/lib/access.server";

export type TrialKind = "daily" | "lifetime";

export type TrialActionSpec = {
  action: string;
  kind: TrialKind;
  limit: number;
  /** Friendly message when the quota is hit. */
  message: string;
};

/**
 * Returns true if the current user is a "free trial" user subject to limits.
 * Admins / paid subscribers / mentors are exempt.
 */
export async function isTrialUser(userId: string): Promise<boolean> {
  const a = await getAccessForUser(userId);
  if (a.isAdmin) return false;
  if (a.subscriptionActive) return false;
  return a.trialActive; // treat only active-trial users as limited
}

async function countUsage(userId: string, action: string, kind: TrialKind): Promise<number> {
  const db = supabaseAdmin as any;
  let q = db.from("trial_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", action);
  if (kind === "daily") {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    q = q.gte("created_at", since.toISOString());
  }
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Throws if the trial quota is exceeded, otherwise records one usage row and returns
 * `{ used, limit, remaining }`. Non-trial users pass through with unlimited quota.
 */
export async function consumeTrialQuota(
  userId: string,
  spec: TrialActionSpec,
): Promise<{ trial: boolean; used: number; limit: number; remaining: number }> {
  if (!(await isTrialUser(userId))) {
    return { trial: false, used: 0, limit: -1, remaining: -1 };
  }
  const used = await countUsage(userId, spec.action, spec.kind);
  if (used >= spec.limit) {
    const scope = spec.kind === "daily" ? "today" : "on the free trial";
    throw new Error(`${spec.message} (${used}/${spec.limit} used ${scope}). Upgrade to Prime or Elite to unlock.`);
  }
  const { error } = await (supabaseAdmin as any)
    .from("trial_usage")
    .insert({ user_id: userId, action: spec.action });
  if (error) throw new Error(error.message);
  return { trial: true, used: used + 1, limit: spec.limit, remaining: Math.max(0, spec.limit - used - 1) };
}

export async function getTrialUsage(
  userId: string,
  spec: TrialActionSpec,
): Promise<{ trial: boolean; used: number; limit: number; remaining: number }> {
  if (!(await isTrialUser(userId))) {
    return { trial: false, used: 0, limit: -1, remaining: -1 };
  }
  const used = await countUsage(userId, spec.action, spec.kind);
  return { trial: true, used, limit: spec.limit, remaining: Math.max(0, spec.limit - used) };
}

// Central place for all trial limits so numbers stay consistent.
export const TRIAL_LIMITS = {
  mockAttempt:      { action: "mock_attempt",   kind: "lifetime", limit: 5, message: "Free trial allows only the first 5 mock tests." } as TrialActionSpec,
  generateTest:     { action: "generate_test",  kind: "daily",    limit: 3, message: "Free trial allows only 3 generated tests per day." } as TrialActionSpec,
  bookmarkTest:     { action: "bookmark_test",  kind: "lifetime", limit: 5, message: "Free trial allows only 5 bookmark practice tests." } as TrialActionSpec,
  mistakesTest:     { action: "mistakes_test",  kind: "lifetime", limit: 5, message: "Free trial allows only 5 mistakes practice tests." } as TrialActionSpec,
  shortNoteDownload:{ action: "shortnote_dl",   kind: "daily",    limit: 3, message: "Free trial allows only 3 short-note downloads per day." } as TrialActionSpec,
  neetlabView:      { action: "neetlab_view",   kind: "daily",    limit: 1, message: "Free trial allows only 1 NEETLab model/simulation per day." } as TrialActionSpec,
} as const;
