import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { HubHero } from "@/components/nav-tiles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Timer, Users, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listPastContests } from "@/lib/contests.functions";


export const Route = createFileRoute("/contests")({
  head: () => ({ meta: [{ title: "Daily Live Quiz — Neet Buddy" }] }),
  component: ContestsPage,
});

type Contest = {
  id: string; title: string; description: string | null;
  prize_pool: number; entry_fee: number;
  starts_at: string; ends_at: string;
  duration_min: number; total_questions: number;
  test_id: string;
};
type EntryStatus = { contest_id: string; submitted: boolean };
type PastContest = Awaited<ReturnType<typeof listPastContests>>[number];

function ContestsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [contests, setContests] = useState<Contest[] | null>(null);
  const [past, setPast] = useState<PastContest[] | null>(null);
  const [entries, setEntries] = useState<Record<string, EntryStatus>>({});

  const fetchPast = useServerFn(listPastContests);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  const load = async () => {
    // All contest tables require an authenticated session. Don't query (or call
    // the protected listPastContests server fn) until the user is signed in,
    // otherwise the request goes out with no bearer token and 401s.
    if (!user) return;
    const nowIso = new Date().toISOString();
    const { data } = await supabase.from("contests")
      .select("id,title,description,prize_pool,entry_fee,starts_at,ends_at,duration_min,total_questions,test_id")
      .gte("ends_at", nowIso).order("starts_at", { ascending: true }).limit(20);
    setContests((data ?? []) as Contest[]);

    const { data: myEntries } = await supabase.from("contest_entries")
      .select("contest_id,attempt_id,attempts:attempt_id(status)")
      .eq("user_id", user.id);
    const map: Record<string, EntryStatus> = {};
    (myEntries ?? []).forEach((e: any) => {
      map[e.contest_id] = { contest_id: e.contest_id, submitted: e.attempts?.status === "completed" };
    });
    // Also detect completed attempts on contest tests even if entry not linked
    const contestIds = (data ?? []).map((c) => c.id);
    if (contestIds.length) {
      const testIds = (data ?? []).map((c) => c.test_id);
      const { data: atts } = await supabase.from("attempts")
        .select("test_id,status").eq("user_id", user.id).in("test_id", testIds).eq("status", "completed");
      (atts ?? []).forEach((a) => {
        const c = (data ?? []).find((x) => x.test_id === a.test_id);
        if (c) map[c.id] = { contest_id: c.id, submitted: true };
      });
    }
    setEntries(map);

    fetchPast().then(setPast).catch(() => setPast([]));
  };
  useEffect(() => { if (!loading && user) load(); }, [user?.id, loading]);

  // Wallet balance shown on /contest/$id page now.

  // All "Join / Play" actions now navigate to the dedicated /contest/$id page
  // which handles pre / live / post states + confirm-join dialog.
  const goToContest = (c: Contest) => nav({ to: "/contest/$contestId", params: { contestId: c.id } });

  if (loading || !user) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const live = (contests ?? []).filter((c) => { const n = Date.now(); return n >= new Date(c.starts_at).getTime() && n < new Date(c.ends_at).getTime(); });
  const upcoming = (contests ?? []).filter((c) => Date.now() < new Date(c.starts_at).getTime());

  return (
    <PageShell>
      <HubHero
        variant="banner"
        eyebrow="Daily live"
        title="Daily Live"
        highlight="Quiz"
        description="Compete daily. Free to join — top ranks earn XP and bragging rights!"
        Icon={Sparkles}
        accent="violet"
        image="/illustrations/hero-contest.png"
        imageAlt="Live quiz clipboard with a trophy"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-violet-700 shadow-sm backdrop-blur dark:bg-white/10 dark:text-violet-200">
          <Trophy className="h-3.5 w-3.5" /> Free to join · XP rewards
        </span>
      </HubHero>

      {contests === null ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : (
        <>
          <Section title="Live now" count={live.length}>
            {live.length === 0 ? <EmptyHint text="No contest live right now. Check back at 7 PM." />
              : live.map((c) => <ContestCard key={c.id} c={c} live joined={!!entries[c.id]} submitted={!!entries[c.id]?.submitted} busy={false} onJoin={() => goToContest(c)} />)}
          </Section>
          <Section title="Upcoming" count={upcoming.length}>
            {upcoming.length === 0 ? <EmptyHint text="No upcoming contests scheduled." />
              : upcoming.map((c) => <ContestCard key={c.id} c={c} joined={!!entries[c.id]} submitted={!!entries[c.id]?.submitted} busy={false} onJoin={() => goToContest(c)} />)}
          </Section>
        </>
      )}

      {/* Past 30 days */}
      <Section title="Previous contests (30 days)" count={past?.length ?? 0}>
        {past === null ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
          : past.length === 0 ? <EmptyHint text="No past contests yet." />
          : past.map((p) => <PastContestCard key={p.id} c={p} meId={user.id} />)}
      </Section>
    </PageShell>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
        {count > 0 && <Badge variant="secondary">{count}</Badge>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function ContestCard({ c, live, joined, submitted, busy, onJoin }: {
  c: Contest; live?: boolean; joined: boolean; submitted: boolean; busy: boolean; onJoin: () => void;
}) {
  const starts = new Date(c.starts_at);
  return (
    <Card className={`overflow-hidden border shadow-soft ${live ? "border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10" : "border-border bg-card"}`}>
      <CardContent className="p-0">
        <div className="flex items-start gap-4 p-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-sm">
            <Trophy className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-bold">{c.title}</div>
                {c.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.description}</div>}
              </div>
              {live && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase text-destructive-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {c.duration_min} min</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.total_questions} Qs</span>
              <span className="inline-flex items-center gap-1">⏰ {starts.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-5 py-3">
          <div className="flex items-center gap-4 text-sm">
            <div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Entry</div><div className="font-bold">Free</div></div>
            <div><div className="text-[10px] font-semibold uppercase text-muted-foreground">Reward</div><div className="font-extrabold text-emerald-600">XP</div></div>
          </div>
          {submitted ? (
            <Badge variant="secondary" className="font-semibold">Played · awaiting results</Badge>
          ) : joined ? (
            live ? (
              <Button asChild size="sm" className="bg-gradient-primary">
                <Link to="/quiz/$testId" params={{ testId: c.test_id }}>Play now <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            ) : <Badge variant="secondary" className="font-semibold">Joined</Badge>
          ) : (
            <Button size="sm" onClick={onJoin} disabled={busy} className="bg-gradient-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : live ? "Join Now" : "Join"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PastContestCard({ c, meId }: { c: PastContest; meId: string }) {
  const myRow = c.leaderboard.find((r) => r.user_id === meId);
  return (
    <Card className="overflow-hidden border-0 shadow-soft">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold">{c.title}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{new Date(c.ends_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
              <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {c.entries_count} joined</span>
              <span>Free · XP rewards</span>
            </div>
          </div>
          {myRow && (
            <div className="text-right">
              <div className="text-[10px] uppercase text-muted-foreground">Your rank</div>
              <div className="text-lg font-extrabold">#{myRow.rank}</div>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Badge variant="secondary" className="text-[10px] font-bold uppercase">Ended</Badge>
          <Button asChild size="sm" variant="default" className="bg-gradient-primary">
            <Link to="/contest/$contestId/results" params={{ contestId: c.id }}>
              See results <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

