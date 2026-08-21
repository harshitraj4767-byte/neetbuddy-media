import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  joinContest,
  getContestDetail,
} from "@/lib/contests.functions";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { LoadingScreen } from "@/components/loading-screen";

export const Route = createFileRoute("/contest/$contestId/join")({
  head: () => ({ meta: [{ title: "Join Daily Live Quiz — Neet Buddy" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { contestId } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const fetchDetail = useServerFn(getContestDetail);
  const join = useServerFn(joinContest);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getContestDetail>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [pendingTestId, setPendingTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    fetchDetail({ data: { contest_id: contestId } })
      .then(setDetail)
      .catch((e) => setErr(e?.message ?? "Failed to load"));
  }, [fetchDetail, contestId]);

  if (loading || (!detail && !err))
    return (
      <LoadingScreen variant="contest" />
    );

  if (err || !detail)
    return (
      <PageShell>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-destructive">{err ?? "Contest not found."}</p>
            <Button asChild variant="link">
              <Link to="/contests">Back to contests</Link>
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );

  const c = detail.contest;
  const alreadyJoined = !!detail.my_entry;

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/contest/$contestId" params={{ contestId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to quiz
        </Link>
      </Button>

      <Card className="overflow-hidden border-0 shadow-elegant">
        <div className="bg-gradient-to-br from-primary to-blue-600 p-6 text-primary-foreground">
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">
            Daily Live Quiz
          </div>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight">{c.title}</h1>
          <p className="mt-2 text-sm text-white/90">
            Free to join. Top ranks earn XP and bragging rights.
          </p>
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Fair-play monitored. {c.total_questions} questions · {c.duration_min} min · Free.
            </span>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" asChild disabled={joining} className="sm:min-w-[120px]">
              <Link to="/contest/$contestId" params={{ contestId }}>Cancel</Link>
            </Button>
            {alreadyJoined ? (
              <Button asChild className="bg-gradient-primary sm:min-w-[200px]">
                <Link to="/contest/$contestId" params={{ contestId }}>You&apos;re already in</Link>
              </Button>
            ) : (
              <Button
                disabled={joining}
                onClick={async () => {
                  setJoining(true);
                  try {
                    const res = await join({ data: { contest_id: contestId, entry_fee: 0 } });
                    toast.success("Joined! Good luck.");
                    const now = Date.now();
                    const startsAt = new Date(c.starts_at).getTime();
                    const endsAt = new Date(c.ends_at).getTime();
                    const liveNow = now >= startsAt && now < endsAt;
                    const testId = res?.test_id ?? c.test_id;
                    if (liveNow && testId) {
                      setPendingTestId(testId);
                      setModePickerOpen(true);
                    } else {
                      nav({ to: "/contest/$contestId", params: { contestId } });
                    }
                  } catch (e) {
                    toast.error((e as Error)?.message ?? "Could not join");
                  } finally {
                    setJoining(false);
                  }
                }}
                className="bg-gradient-primary sm:min-w-[200px]"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Confirm &amp; Join · Free</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <QuizModePicker
        open={modePickerOpen}
        subtitle="Pick how you want to play this Daily Live Quiz."
        onClose={() => setModePickerOpen(false)}
        onPick={(mode: QuizMode) => {
          if (pendingTestId) nav({ to: "/quiz/$testId", params: { testId: pendingTestId }, search: { mode } });
        }}
      />
    </PageShell>
  );
}
