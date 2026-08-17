import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AttemptState = {
  /** latest attempt for the test, whatever its status */
  attemptId: string;
  status: "in_progress" | "completed" | string;
  score: number | null;
  submittedAt: string | null;
};

export type AttemptStateMap = Record<string, AttemptState>;

/**
 * Loads the current user's latest attempt for every test id passed in, so a
 * card can show "Attempt" / "Resume" / "Reattempt + View solution" instead of
 * always pretending the test is untouched.
 */
export function useAttemptStates(testIds: string[] | null | undefined) {
  const { user } = useAuth();
  const [map, setMap] = useState<AttemptStateMap>({});
  const [loaded, setLoaded] = useState(false);
  const key = (testIds ?? []).join(",");

  useEffect(() => {
    let cancelled = false;
    if (!user || !testIds || testIds.length === 0) {
      setMap({});
      setLoaded(true);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("attempts")
        .select("id,test_id,status,score,submitted_at,started_at")
        .eq("user_id", user.id)
        .in("test_id", testIds)
        .order("started_at", { ascending: false });
      if (cancelled) return;
      const next: AttemptStateMap = {};
      for (const row of (data ?? []) as Array<{
        id: string; test_id: string; status: string; score: number | null; submitted_at: string | null;
      }>) {
        const prev = next[row.test_id];
        // Prefer an in-progress attempt (resume) over an older finished one.
        if (!prev || (prev.status !== "in_progress" && row.status === "in_progress")) {
          next[row.test_id] = {
            attemptId: row.id,
            status: row.status,
            score: row.score === null ? null : Number(row.score),
            submittedAt: row.submitted_at,
          };
        }
      }
      setMap(next);
      setLoaded(true);
    })().catch(() => setLoaded(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  return { attempts: map, loaded };
}
