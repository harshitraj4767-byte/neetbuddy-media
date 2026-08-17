import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Users, UserPlus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateGroup,
  adminListGroups,
  adminListMentors,
  adminAssignMentorToGroup,
  adminAddGroupMemberByEmail,
  adminRemoveGroupMember,
  getGroupDetail,
} from "@/lib/groups.functions";

export function AdminGroupsPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? (
    <GroupDetail groupId={openId} onBack={() => setOpenId(null)} />
  ) : (
    <GroupsList onOpen={setOpenId} />
  );
}

function GroupsList({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListGroups);
  const mentorsFn = useServerFn(adminListMentors);
  const createFn = useServerFn(adminCreateGroup);

  const groupsQ = useQuery({ queryKey: ["admin-groups"], queryFn: () => listFn() });
  const mentorsQ = useQuery({ queryKey: ["admin-mentors-list"], queryFn: () => mentorsFn() });

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [mentorId, setMentorId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return toast.error("Group name required");
    setSaving(true);
    try {
      await createFn({ data: {
        name: name.trim(),
        description: desc.trim() || null,
        mentor_id: mentorId === "none" ? null : mentorId,
      } });
      toast.success("Group created");
      setName(""); setDesc(""); setMentorId("none");
      qc.invalidateQueries({ queryKey: ["admin-groups"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> Create mentorship group
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={mentorId} onValueChange={setMentorId}>
            <SelectTrigger><SelectValue placeholder="Assign mentor (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— No mentor —</SelectItem>
              {(mentorsQ.data?.mentors ?? []).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name}{!m.active && " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            className="sm:col-span-2"
            placeholder="Description (optional)"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={create} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create group
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groupsQ.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {(groupsQ.data?.groups ?? []).length === 0 && !groupsQ.isLoading && (
          <p className="text-sm text-muted-foreground">No groups yet.</p>
        )}
        {(groupsQ.data?.groups ?? []).map((g: any) => (
          <button key={g.id} onClick={() => onOpen(g.id)} className="text-left">
            <Card className="transition-all hover:border-primary hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-primary-foreground">
                    <Users className="h-4 w-4" />
                  </div>
                  {g.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                <div>{g.description ?? "—"}</div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">{g.member_ids.length} members</Badge>
                  {!g.mentor_id && <Badge variant="outline" className="text-[10px]">No mentor</Badge>}
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupDetail({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getGroupDetail);
  const mentorsFn = useServerFn(adminListMentors);
  const assignFn = useServerFn(adminAssignMentorToGroup);
  const addFn = useServerFn(adminAddGroupMemberByEmail);
  const removeFn = useServerFn(adminRemoveGroupMember);

  const detailQ = useQuery({ queryKey: ["admin-group", groupId], queryFn: () => detailFn({ data: { group_id: groupId } }) });
  const mentorsQ = useQuery({ queryKey: ["admin-mentors-list"], queryFn: () => mentorsFn() });

  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-group", groupId] });
    qc.invalidateQueries({ queryKey: ["admin-groups"] });
  };

  const addMember = async () => {
    if (!email.trim()) return;
    setAdding(true);
    try {
      await addFn({ data: { group_id: groupId, email: email.trim() } });
      toast.success("Member added");
      setEmail("");
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setAdding(false); }
  };

  const removeMember = async (userId: string) => {
    try {
      await removeFn({ data: { group_id: groupId, user_id: userId } });
      toast.success("Removed");
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const assignMentor = async (value: string) => {
    try {
      await assignFn({ data: { group_id: groupId, mentor_id: value === "none" ? null : value } });
      toast.success("Mentor updated");
      invalidate();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  if (detailQ.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const d = detailQ.data!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All groups
        </Button>
        <div className="text-right">
          <h2 className="text-lg font-bold">{d.group.name}</h2>
          {d.group.description && <p className="text-xs text-muted-foreground">{d.group.description}</p>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Assigned mentor</CardTitle></CardHeader>
        <CardContent>
          <Select value={d.group.mentor_id ?? "none"} onValueChange={assignMentor}>
            <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— No mentor —</SelectItem>
              {(mentorsQ.data?.mentors ?? []).map((m: any) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name}{!m.active && " (inactive)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <UserPlus className="h-4 w-4" /> Add member by email
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="student@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addMember(); }}
          />
          <Button onClick={addMember} disabled={adding || !email.trim()}>
            {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Members ({d.members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.members.length === 0 && <p className="text-xs text-muted-foreground">No members yet.</p>}
          {d.members.map((m: any) => (
            <div key={m.user_id} className="flex items-center justify-between rounded-md border border-border p-2 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.display_name ?? m.email}</div>
                <div className="truncate text-[10px] text-muted-foreground">{m.email}</div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeMember(m.user_id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
