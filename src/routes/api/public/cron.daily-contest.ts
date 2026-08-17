import { createFileRoute } from "@tanstack/react-router";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Creates the daily free live quiz.
 *
 * Schedule intent (IST): trigger this endpoint at 14:00 IST (08:30 UTC) daily.
 * The contest itself runs 18:00–20:00 IST (2 hours).
 * Paper: 20 Physics + 20 Chemistry + 30 Biology = 70 questions from the DB.
 *
 * Cron string (UTC): `30 8 * * *`
 * curl:
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *     https://project--<id>.lovable.app/api/public/cron/daily-contest
 */
export const Route = createFileRoute("/api/public/cron/daily-contest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await verifyCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Compute today's 18:00 IST → 20:00 IST window in UTC.
        // IST = UTC+5:30. Build "today in IST" from the current UTC instant.
        const nowUtc = new Date();
        const istNow = new Date(nowUtc.getTime() + 5.5 * 3600_000);
        const y = istNow.getUTCFullYear();
        const m = istNow.getUTCMonth();
        const d = istNow.getUTCDate();
        const startsAt = new Date(Date.UTC(y, m, d, 18 - 5, 60 - 30)); // 18:00 IST → 12:30 UTC
        // Fix: 18:00 IST = 12:30 UTC exactly.
        startsAt.setTime(Date.UTC(y, m, d, 12, 30, 0));
        const endsAt = new Date(startsAt.getTime() + 120 * 60_000);

        // Skip if a daily contest already exists for today's window.
        const dayStartUtc = new Date(Date.UTC(y, m, d, 0, 0, 0));
        const { data: existing } = await supabaseAdmin
          .from("contests")
          .select("id")
          .gte("starts_at", dayStartUtc.toISOString())
          .ilike("title", "Daily Live Quiz%")
          .limit(1);
        if (existing && existing.length > 0) {
          return new Response(JSON.stringify({ ok: true, skipped: "already exists", id: existing[0].id }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }

        // Build a NEET-style paper straight from the question bank:
        // 20 Physics + 20 Chemistry + 30 Biology.
        const PLAN: Array<{ subject: string; n: number }> = [
          { subject: "physics", n: 20 },
          { subject: "chemistry", n: 20 },
          { subject: "biology", n: 30 },
        ];
        type QRow = { id: number | string; difficulty: string | null; qtype: string | null; question_image_url: string | null };
        const priority = (q: QRow) => {
          const t = (q.qtype ?? "").toLowerCase();
          if (t.includes("match")) return 1;
          if (t.includes("assertion")) return 2;
          if (t.includes("type-2") || t.includes("type-3")) return 3;
          if (q.question_image_url || t.includes("diagram") || t.includes("graph") || t.includes("figure")) return 4;
          return 5;
        };
        const shuffle = <T,>(a: T[]) => a.slice().sort(() => Math.random() - 0.5);

        const questionIds: string[] = [];
        for (const { subject, n } of PLAN) {
          const { data: pool, error: qErr } = await (supabaseAdmin as any)
            .from("qb_questions")
            .select("id,difficulty,qtype,question_image_url")
            .eq("subject_id", subject)
            .limit(1500);
          if (qErr) {
            return new Response(JSON.stringify({ ok: false, error: qErr.message }), {
              status: 500, headers: { "content-type": "application/json" },
            });
          }
          const rows = shuffle((pool ?? []) as QRow[]);
          const bucket = (d: string) => rows.filter((q) => (q.difficulty ?? "").toLowerCase() === d);
          // NEET-like difficulty mix: 30% easy, 50% medium, 20% hard.
          const want = { easy: Math.round(n * 0.3), medium: Math.round(n * 0.5), hard: 0 };
          want.hard = n - want.easy - want.medium;
          const picked: QRow[] = [
            ...bucket("easy").sort((a, b) => priority(a) - priority(b)).slice(0, want.easy),
            ...bucket("medium").sort((a, b) => priority(a) - priority(b)).slice(0, want.medium),
            ...bucket("hard").sort((a, b) => priority(a) - priority(b)).slice(0, want.hard),
          ];
          const used = new Set(picked.map((q) => String(q.id)));
          for (const q of rows) {
            if (picked.length >= n) break;
            if (!used.has(String(q.id))) { picked.push(q); used.add(String(q.id)); }
          }
          for (const q of shuffle(picked).slice(0, n)) questionIds.push(String(q.id));
        }

        if (questionIds.length < 30) {
          return new Response(JSON.stringify({ ok: false, error: `Only ${questionIds.length} questions available` }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }

        const title = `Daily Live Quiz — ${istNow.toUTCString().slice(0, 16)}`;

        const { data: test, error: tErr } = await supabaseAdmin.from("tests").insert({
          title, description: "Free daily live quiz — 6 PM to 8 PM IST",
          type: "contest", difficulty: "medium",
          duration_min: 120, total_questions: questionIds.length,
          is_paid: false, entry_fee: 0, prize_pool: 0,
          starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
          question_ids: questionIds, marks_correct: 4, marks_wrong: -1,
          source: "CRON-DAILY-LIVE-QUIZ",
        }).select("id").single();
        if (tErr) {
          return new Response(JSON.stringify({ ok: false, error: tErr.message }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }

        const { data: contest, error: cErr } = await supabaseAdmin.from("contests").insert({
          title, description: "Free daily live quiz — 6 PM to 8 PM IST",
          prize_pool: 0, entry_fee: 0,
          starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
          duration_min: 120, total_questions: questionIds.length,
          chapter_ids: [], question_ids: [],
          test_id: test.id,
        }).select("id").single();
        if (cErr) {
          return new Response(JSON.stringify({ ok: false, error: cErr.message }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }

        await supabaseAdmin.from("cron_job_runs").insert({
          job_name: "daily-contest",
          status: "ok",
          details: { contest_id: contest.id, test_id: test.id, questions: questionIds.length },
        }).then(() => undefined, () => undefined);

        return new Response(JSON.stringify({ ok: true, contest_id: contest.id, test_id: test.id, questions: questionIds.length }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
