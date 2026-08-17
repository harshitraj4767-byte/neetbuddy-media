import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Users, Radio, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createStudyGroup, joinStudyGroup, listMyStudyGroups } from "@/lib/study-groups.functions";

export const Route = createFileRoute("/study-groups/")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s.code === "string" ? s.code : undefined }),
  head: () => ({
    meta: [
      { title: "Study Groups — Study together, track live hours" },
      { name: "description", content: "Create a study group, invite friends with a link, run a live study timer and climb the discipline leaderboard." },
      { property: "og:title", content: "Study Groups — Neet Buddy" },
      { property: "og:description", content: "Live study timer, group tasks, XP and a 0–100 discipline rating." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyGroupsPage,
});

function StudyGroupsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { code } = Route.useSearch();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login", replace: true });
  }, [loading, user, nav]);

  const listFn = useServerFn(listMyStudyGroups);
  const createFn = useServerFn(createStudyGroup);
  const joinFn = useServerFn(joinStudyGroup);

  const groupsQ = useQuery({
    queryKey: ["study-groups"],
    queryFn: () => listFn(undefined),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Auto-join when arriving from a shared invite link.
  useEffect(() => {
    if (!user || !code) return;
    joinFn({ data: { code } })
      .then((g) => {
        toast.success(`Joined ${g.name}`);
        nav({ to: "/study-groups/$groupId", params: { groupId: g.id }, replace: true });
      })
      .catch((e: Error) => toast.error(e.message));
  }, [user, code]);

  if (loading || !user) return null;

  const create = async () => {
    if (name.trim().length < 2) return toast.error("Give your group a name");
    setBusy(true);
    try {
      const g = await createFn({ data: { name: name.trim(), description: desc.trim() || undefined } });
      toast.success("Group created");
      setName("");
      setDesc("");
      qc.invalidateQueries({ queryKey: ["study-groups"] });
      nav({ to: "/study-groups/$groupId", params: { groupId: g.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const g = await joinFn({ data: { code: joinCode.trim() } });
      toast.success(`Joined ${g.name}`);
      nav({ to: "/study-groups/$groupId", params: { groupId: g.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const groups = groupsQ.data?.groups ?? [];

  return (
    <PageShell
      eyebrow="Group study"
      title="Study Groups"
      description="Study together in real time. No chat, just focus — live timers, shared targets, XP and a discipline rating out of 100."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">My groups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {groupsQ.isLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {!groupsQ.isLoading && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No groups yet. Create one or join with an invite code.</p>
            )}
            {groups.map((g: any) => (
              <Link
                key={g.id}
                to="/study-groups/$groupId"
                params={{ groupId: g.id }}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{g.name}</span>
                    {g.is_owner && <Badge variant="secondary">Owner</Badge>}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {g.member_count} members
                    </span>
                    {g.live_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Radio className="h-3.5 w-3.5 animate-pulse" /> {g.live_count} studying now
                      </span>
                    )}
                  </div>
                </div>
                <code className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs">{g.invite_code}</code>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create a group</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              <Textarea
                placeholder="What is this group for? (optional)"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <Button onClick={create} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create group
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Join with a code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="e.g. K7QM2XP"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={16}
              />
              <Button variant="secondary" onClick={join} disabled={busy} className="w-full">
                <LogIn className="mr-2 h-4 w-4" /> Join group
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
