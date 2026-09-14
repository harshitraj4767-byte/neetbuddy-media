// Server-only access helpers. Do NOT import from client bundles.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Tier = "elite" | "prime" | "essential" | "trial" | "none";

export type MyAccess = {
  tier: Tier;
  isAdmin: boolean;
  isMentor: boolean;
  trialActive: boolean;
  trialExpiresAt: string | null;
  subscriptionActive: boolean;
  subscriptionExpiresAt: string | null;
  batchId: string | null;
  batchTitle: string | null;
  features: string[];
};

const TRIAL_FALLBACK_FEATURES = [
  "daily_dpp",
  "mock_tests",
  "generate_test",
  "bookmarks",
  "weekly_progress",
  "subject_wise_quiz",
];

// Features locked to Prime/Elite subscribers only. Trial + Essential never
// get these regardless of what the batch JSON says.
const PRIME_ONLY_FEATURES = ["ai_path", "score_predictor"];

// Always free for every signed-in user, trial or not.
export const FREE_FEATURES = ["daily_dpp", "contests", "battlegrounds"];

// Length of the free trial granted to every new account.
const TRIAL_DAYS = 3;

// Accounts that always get full (admin) access, regardless of the DB role rows.
const ADMIN_EMAILS = ["sanskarjaiswal6892@gmail.com"];
function stripPrimeOnly(features: string[]): string[] {
  return features.filter((k) => !PRIME_ONLY_FEATURES.includes(k));
}

function detectTier(title: string | null | undefined): Tier {
  const t = (title ?? "").toLowerCase();
  if (t.includes("elite")) return "elite";
  if (t.includes("prime")) return "prime";
  if (t.includes("essential")) return "essential";
  return "essential";
}

function featuresFromJson(features: unknown): string[] {
  if (!features || typeof features !== "object") return [];
  return Object.entries(features as Record<string, unknown>)
    .filter(([, v]) => !!v)
    .map(([k]) => k);
}

// Small in-request cache so multiple requireFeature() calls in one request don't
// re-hit the DB.
const cache = new Map<string, { v: MyAccess; t: number }>();
const CACHE_TTL_MS = 10_000;

export async function getAccessForUser(userId: string): Promise<MyAccess> {
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.t < CACHE_TTL_MS) return hit.v;

  const db = supabaseAdmin as any;

  // Admin?
  const { data: role } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  let isAdmin = !!role;

  // Mentor?
  const { data: mentorRow } = await db
    .from("mentors")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const isMentor = !!mentorRow;

  // Active subscription (with linked batch if any)
  const { data: sub } = await db
    .from("subscriptions")
    .select("id, plan, expires_at, source_batch_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let batchRow: { id: string; title: string; features: any } | null = null;
  if (sub?.source_batch_id) {
    const { data: b } = await db
      .from("batches")
      .select("id, title, features")
      .eq("id", sub.source_batch_id)
      .maybeSingle();
    if (b) batchRow = b as any;
  }

  // Trial info.
  // `profiles.trial_expires_at` does not exist on every deployment, so when it
  // is missing/empty we derive the trial window from the account's creation
  // date. Without this, brand-new users fell through to "trial ended".
  let profRow: any = null;
  {
    const { data, error } = await db
      .from("profiles")
      .select("email, created_at, trial_expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      const { data: basic } = await db
        .from("profiles")
        .select("email, created_at")
        .eq("id", userId)
        .maybeSingle();
      profRow = basic ?? null;
    } else {
      profRow = data;
    }
  }

  let email: string | null = (profRow?.email ?? null) as string | null;
  if (!email) {
    try {
      const { data: authUser } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
      email = authUser?.user?.email ?? null;
    } catch {
      // Auth admin API unavailable (e.g. non-Supabase host) — ignore.
    }
  }
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) isAdmin = true;

  let trialExp: string | null = profRow?.trial_expires_at ?? null;
  if (!trialExp) {
    const createdAt = profRow?.created_at ? new Date(profRow.created_at).getTime() : NaN;
    if (!Number.isNaN(createdAt)) {
      trialExp = new Date(createdAt + TRIAL_DAYS * 86_400_000).toISOString();
    }
  }
  const trialActive = !!trialExp && new Date(trialExp).getTime() > now;

  let result: MyAccess;

  if (isAdmin) {
    // Admins bypass everything → treat as elite with all known features unlocked.
    const { data: allBatches } = await db.from("batches").select("features");
    const merged = new Set<string>();
    for (const b of (allBatches ?? []) as Array<{ features: any }>) {
      for (const k of featuresFromJson(b.features)) merged.add(k);
    }
    // Add a few global keys that may not appear in batch JSON.
    ["contests", "battlegrounds", "infinite_run", "pyqs"].forEach((k) => merged.add(k));
    result = {
      tier: "elite",
      isAdmin: true,
      isMentor,
      trialActive,
      trialExpiresAt: trialExp,
      subscriptionActive: true,
      subscriptionExpiresAt: null,
      batchId: batchRow?.id ?? null,
      batchTitle: "Admin",
      features: Array.from(merged),
    };
  } else if (sub) {
    const isMentorship = typeof sub.plan === "string" && sub.plan.startsWith("mentorship_");
    let features: string[];
    let tier: Tier;
    let batchTitle: string | null;
    if (isMentorship) {
      // Mentorship subscribers get elite-level access to every feature the app knows about.
      const { data: allBatches } = await db.from("batches").select("features");
      const merged = new Set<string>();
      for (const b of (allBatches ?? []) as Array<{ features: any }>) {
        for (const k of featuresFromJson(b.features)) merged.add(k);
      }
      ["contests", "battlegrounds", "infinite_run"].forEach((k) => merged.add(k));
      features = Array.from(merged).filter((k) => k !== "pyqs");
      tier = "elite";
      batchTitle = "1-on-1 Mentorship";
    } else {
      features = featuresFromJson(batchRow?.features);
      if (features.length === 0) features = [...TRIAL_FALLBACK_FEATURES, "flashcards", "ncert_highlights", "score_predictor", "neetlab", "ai_path", "advanced_analytics", "priority_support"];
      ["contests", "battlegrounds", "infinite_run"].forEach((k) => { if (!features.includes(k)) features.push(k); });
      features = features.filter((k) => k !== "pyqs");
      tier = detectTier(batchRow?.title ?? sub.plan);
      batchTitle = batchRow?.title ?? null;
      // Prime-only gate: only Prime/Elite paid tiers keep AI Path & Score Predictor.
      if (tier !== "prime" && tier !== "elite") features = stripPrimeOnly(features);
    }
    result = {
      tier,
      isAdmin: false,
      isMentor,
      trialActive: false,
      trialExpiresAt: trialExp,
      subscriptionActive: true,
      subscriptionExpiresAt: sub.expires_at,
      batchId: batchRow?.id ?? null,
      batchTitle,
      features,
    };
  } else if (trialActive) {
    // 7-day free trial: essentials only. Prime-only tools (AI Path,
    // Score Predictor) require an actual Prime subscription.
    const { data: prime } = await db
      .from("batches")
      .select("features")
      .ilike("title", "Prime%")
      .maybeSingle();
    let features = prime?.features
      ? featuresFromJson(prime.features)
      : [
          ...TRIAL_FALLBACK_FEATURES,
          "flashcards",
          "ncert_highlights",
          "neetlab",
          "advanced_analytics",
          "priority_support",
        ];
    ["contests", "battlegrounds", "infinite_run"].forEach((k) => {
      if (!features.includes(k)) features.push(k);
    });
    features = features.filter((k) => k !== "pyqs");
    features = stripPrimeOnly(features); // Trial never gets AI Path / Score Predictor.
    result = {
      tier: "trial",
      isAdmin: false,
      isMentor,
      trialActive: true,
      trialExpiresAt: trialExp,
      subscriptionActive: false,
      subscriptionExpiresAt: null,
      batchId: null,
      batchTitle: "Free Trial",
      features,
    };
  } else {
    result = {
      tier: "none",
      isAdmin: false,
      isMentor,
      trialActive: false,
      trialExpiresAt: trialExp,
      subscriptionActive: false,
      subscriptionExpiresAt: null,
      batchId: null,
      batchTitle: null,
      features: [...FREE_FEATURES],
    };
  }

  cache.set(userId, { v: result, t: now });
  return result;
}

/** Throw if the user does not have the given feature key. */
export async function requireFeature(userId: string, key: string): Promise<void> {
  const access = await getAccessForUser(userId);
  if (access.isAdmin) return;
  if (FREE_FEATURES.includes(key)) return;
  if (access.features.includes(key)) return;
  throw new Error(
    access.trialActive
      ? "Upgrade required: this feature isn't included in your trial. Purchase a batch to unlock."
      : access.subscriptionActive
      ? "Upgrade required: your current batch doesn't include this feature. Upgrade to unlock."
      : "This feature requires an active batch. Visit Premium to unlock.",
  );
}
