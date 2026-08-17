import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Loader2, CheckCircle2, UserMinus, Crown } from "lucide-react";
import {
  adminListMentorsForAssign,
  adminAssignMentor,
  adminUnassignMentor,
  getUserAssignedMentor,
  adminListEliteUnassignedStudents,
} from "@/lib/mentors.functions";
import { toast } from "sonner";

type Mentor = {
  id: string;
  user_id: string;
  display_name: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export function AdminAssignMentorPanel() {
  const [userId, setUserId] = useState("");
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [loadingCurrent, setLoadingCurrent] = useState(false);
  const [elite, setElite] = useState<Array<{ user_id: string; display_name: string | null; avatar_url: string | null; email: string | null }>>([]);
  const [loadingElite, setLoadingElite] = useState(true);

  const listMentors = useServerFn(adminListMentorsForAssign);
  const assign = useServerFn(adminAssignMentor);
  const unassign = useServerFn(adminUnassignMentor);
  const getCurrent = useServerFn(getUserAssignedMentor);
  const listElite = useServerFn(adminListEliteUnassignedStudents);

  useEffect(() => {
    listMentors().then((rows: any) => setMentors(rows ?? [])).catch(() => setMentors([]));
    setLoadingElite(true);
    listElite()
      .then((rows: any) => setElite(rows ?? []))
      .catch(() => setElite([]))
      .finally(() => setLoadingElite(false));
  }, [listMentors, listElite]);

  async function loadCurrent() {
    if (!userId.trim()) return;
    setLoadingCurrent(true);
    try {
      const c = await getCurrent({ data: { user_id: userId.trim() } });
      setCurrent(c);
    } catch (e: any) {
      toast.error(e.message);
      setCurrent(null);
    } finally {
      setLoadingCurrent(false);
    }
  }

  async function loadCurrentFor(uid: string) {
    setLoadingCurrent(true);
    try {
      const c = await getCurrent({ data: { user_id: uid } });
      setCurrent(c);
    } catch {
      setCurrent(null);
    } finally {
      setLoadingCurrent(false);
    }
  }

  async function pick(m: Mentor) {
    if (!userId.trim()) return toast.error("Enter the student's user ID first.");
    setBusy(true);
    try {
      await assign({ data: { user_id: userId.trim(), mentor_id: m.id } });
      toast.success(`Assigned to ${m.display_name}`);
      await loadCurrent();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function drop() {
    if (!userId.trim()) return;
    setBusy(true);
    try {
      await unassign({ data: { user_id: userId.trim() } });
      toast.success("Mentor unassigned");
      setCurrent(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Assign mentor to a student</h3>
        </div>
        {/* Elite students without a mentor */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <Crown className="h-4 w-4" /> Elite students without a mentor ({elite.length})
          </div>
          {loadingElite ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : elite.length === 0 ? (
            <p className="text-xs text-muted-foreground">All Elite students are assigned. 🎉</p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {elite.map((s) => (
                <button
                  key={s.user_id}
                  onClick={() => { setUserId(s.user_id); loadCurrentFor(s.user_id); }}
                  className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs transition ${userId === s.user_id ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-background"}`}
                >
                  <Avatar className="h-7 w-7"><AvatarImage src={s.avatar_url ?? undefined} /><AvatarFallback>{(s.display_name ?? s.email ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.display_name ?? s.email ?? s.user_id.slice(0, 8)}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{s.user_id}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Pick a student above (or paste any user ID), then click a mentor below. The student is automatically moved into that mentor's group.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label>Student user ID</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-..." />
          </div>
          <Button variant="outline" onClick={loadCurrent} disabled={loadingCurrent || !userId.trim()}>
            {loadingCurrent ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load current"}
          </Button>
          {current?.mentor && (
            <Button variant="ghost" onClick={drop} disabled={busy} className="text-destructive">
              <UserMinus className="mr-1 h-4 w-4" /> Unassign
            </Button>
          )}
        </div>

        {current?.mentor && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              Currently assigned to <span className="font-semibold">{current.mentor.display_name}</span>
              {current.mentor.title && <span className="text-muted-foreground"> — {current.mentor.title}</span>}
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Available mentors ({mentors.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {mentors.length === 0 && (
              <p className="col-span-full text-sm text-muted-foreground">No active mentors. Add one in the Mentors tab.</p>
            )}
            {mentors.map((m) => {
              const isCurrent = current?.mentor?.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => pick(m)}
                  disabled={busy || isCurrent}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                    isCurrent
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={m.avatar_url ?? undefined} />
                    <AvatarFallback>{m.display_name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{m.display_name}</div>
                    {m.title && <div className="truncate text-xs text-muted-foreground">{m.title}</div>}
                    {m.bio && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{m.bio}</div>}
                  </div>
                  {isCurrent && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}