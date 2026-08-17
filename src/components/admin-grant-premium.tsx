import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, Loader2 } from "lucide-react";
import { adminGrantPremium, adminListBatches } from "@/lib/batches.functions";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

export function AdminGrantPremium() {
  const [userId, setUserId] = useState("");
  const [days, setDays] = useState(30);
  const [note, setNote] = useState("");
  const [batchId, setBatchId] = useState<string>("__all__");
  const [batches, setBatches] = useState<Array<{ id: string; title: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const grant = useServerFn(adminGrantPremium);
  const listBatches = useServerFn(adminListBatches);

  useEffect(() => {
    listBatches()
      .then((rows: any[]) =>
        setBatches((rows ?? []).map((b) => ({ id: b.id, title: b.title }))),
      )
      .catch(() => setBatches([]));
  }, [listBatches]);

  async function go() {
    setBusy(true);
    try {
      const r = await grant({
        data: {
          user_id: userId.trim(),
          days: Number(days),
          note: note || null,
          batch_id: batchId === "__all__" ? null : batchId,
        },
      });
      toast.success("Premium granted");
      setLast(r.expires_at);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold">Grant premium to a user</h3>
        </div>
        <p className="text-xs text-muted-foreground">Find the user's UUID in the User Report tab. Choose a batch to scope the features unlocked, or leave as "All features" for a legacy full grant.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><Label>User ID (UUID)</Label><Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-..." /></div>
          <div><Label>Days</Label><Input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} /></div>
        </div>
        <div>
          <Label>Batch</Label>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger><SelectValue placeholder="Choose a batch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All features (legacy full grant)</SelectItem>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. compensation / scholarship" /></div>
        <Button onClick={go} disabled={busy || !userId}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />} Grant premium</Button>
        {last && <div className="text-sm text-emerald-600">Active until {new Date(last).toLocaleString()}</div>}
      </CardContent>
    </Card>
  );
}
