import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GraduationCap, Loader2, UserMinus } from "lucide-react";
import { adminSetMentor, adminRemoveMentor } from "@/lib/mentors.functions";
import { toast } from "sonner";

export function AdminMentorsPanel() {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const setMentor = useServerFn(adminSetMentor);
  const removeMentor = useServerFn(adminRemoveMentor);

  async function make() {
    setBusy(true);
    try {
      await setMentor({ data: { user_id: userId.trim(), display_name: name, title: title || null, bio: bio || null } });
      toast.success("User is now a mentor");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }
  async function unmake() {
    setBusy(true);
    try {
      await removeMentor({ data: { user_id: userId.trim() } });
      toast.success("Mentor removed");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Manage mentors</h3>
        </div>
        <p className="text-xs text-muted-foreground">Find the user's UUID in the User Report tab. Promoting a user grants the <code>mentor</code> role and creates a profile in the mentors directory.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>User ID (UUID)</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-..." /></div>
          <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. Ananya" /></div>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AIIMS Faculty" /></div>
          <div className="sm:col-span-2"><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} /></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={make} disabled={busy || !userId || !name}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />} Make mentor</Button>
          <Button variant="outline" onClick={unmake} disabled={busy || !userId}><UserMinus className="mr-2 h-4 w-4" /> Remove mentor</Button>
        </div>
      </CardContent>
    </Card>
  );
}
