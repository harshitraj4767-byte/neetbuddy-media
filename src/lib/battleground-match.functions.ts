// Battlegrounds matchmaking helpers.
//
// WHY: the page used to run the whole "find opponent" flow from the browser.
// When the match row itself was created fine but RLS hid `battle_matches` /
// `battle_queue` from the player, the poll never saw a `test_id` and the UI sat
// on "Finding opponent…" forever (and, if the bot RPC errored, retried every
// two seconds while spamming toasts).
//
// Match CREATION still runs as the signed-in user (the RPCs rely on
// `auth.uid()`), but every READ afterwards goes through the service-role client
// so a policy gap can never strand the player in the waiting state.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LEGACY_SIGNATURE = /_subject|_stake|argument|does not exist|schema cache|function .* does not exist/i;

type MatchInfo = {
  matchId: string;
  testId: string | null;
  countdownStartsAt: string | null;
  isBot: boolean;
  botName: string | null;
  botAvatarUrl: string | null;
};

async function readMatch(matchId: string): Promise<MatchInfo | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };
  const { data } = await admin
    .from("battle_matches")
    .select("id,test_id,countdown_starts_at,is_bot_match,bot_name,bot_avatar_url")
    .eq("id", matchId)
    .maybeSingle();
  if (!data) return null;
  return {
    matchId: String(data.id),
    testId: data.test_id ? String(data.test_id) : null,
    countdownStartsAt: data.countdown_starts_at ?? null,
    isBot: !!data.is_bot_match,
    botName: data.bot_name ?? null,
    botAvatarUrl: data.bot_avatar_url ?? null,
  };
}

async function readOpponent(matchId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as { from: (t: string) => any };
  const { data: players } = await admin
    .from("battle_match_players")
    .select("user_id")
    .eq("match_id", matchId);
  const other = (players ?? []).map((p: any) => String(p.user_id)).find((id: string) => id !== userId);
  if (!other) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id,full_name,avatar_url")
    .eq("id", other)
    .maybeSingle();
  return {
    user_id: other,
    full_name: profile?.full_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
    is_bot: false,
  };
}

/**
 * Current queue/match state for the signed-in player. Read with the service
 * role so RLS can never hide a match the player is actually in.
 */
export const getBattleQueueState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as { from: (t: string) => any };
    const { data: rows } = await admin
      .from("battle_queue")
      .select("status,match_id,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (rows ?? [])[0];
    if (!row?.match_id || row.status !== "matched") {
      return { status: (row?.status as string) ?? "idle", match: null, opponent: null };
    }
    const match = await readMatch(String(row.match_id));
    const opponent = match?.isBot ? null : await readOpponent(String(row.match_id), context.userId);
    return { status: "matched" as const, match, opponent };
  });

/**
 * Ask the server for a bot opponent. Tries both RPC signatures and always
 * returns the resolved match details (or a readable error) instead of leaving
 * the client to poll blindly.
 */
export const matchWithBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subject: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;

    // The RPCs read auth.uid(), so they must run as the player, not admin.
    let res = await sb.rpc("bg_match_with_bot", { _subject: data.subject });
    if (res.error && LEGACY_SIGNATURE.test(res.error.message ?? "")) {
      res = await sb.rpc("bg_match_with_bot");
    }
    if (res.error) {
      return { ok: false as const, error: res.error.message ?? "Matchmaking failed" };
    }

    const payload = res.data as { status?: string; match_id?: string } | null;
    let matchId = payload?.match_id ? String(payload.match_id) : null;

    // Some deployments only flip the queue row instead of returning the id.
    if (!matchId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { from: (t: string) => any };
      const { data: rows } = await admin
        .from("battle_queue")
        .select("match_id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1);
      matchId = rows?.[0]?.match_id ? String(rows[0].match_id) : null;
    }
    if (!matchId) return { ok: false as const, error: "No opponent could be created right now." };

    const match = await readMatch(matchId);
    if (!match?.testId) {
      return { ok: false as const, error: "Match was created without questions. Please try again." };
    }
    return { ok: true as const, match };
  });
