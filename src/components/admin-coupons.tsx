import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { adminListCoupons, adminUpsertCoupon, adminDeleteCoupon, adminListBatches } from "@/lib/batches.functions";
import { toast } from "sonner";

export function AdminCouponsTab() {
  const [coupons, setCoupons] = useState<any[] | null>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "flat">("percent");
  const [value, setValue] = useState(10);
  const [maxUses, setMaxUses] = useState<string>("");
  const [expires, setExpires] = useState<string>("");
  const [program, setProgram] = useState<"batch" | "mentorship">("batch");
  const [batchId, setBatchId] = useState<string>("all");
  const [mentorPlans, setMentorPlans] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const listFn = useServerFn(adminListCoupons);
  const upsert = useServerFn(adminUpsertCoupon);
  const del = useServerFn(adminDeleteCoupon);
  const listB = useServerFn(adminListBatches);

  async function refresh() {
    const [c, b] = await Promise.all([listFn(), listB()]);
    setCoupons(c as any[]); setBatches(b as any[]);
  }
  useEffect(() => { refresh().catch((e) => toast.error(e.message)); }, []);

  const selectedBatch = batches.find((b) => b.id === batchId);
  const commissionPreview = (() => {
    const t = String(selectedBatch?.title ?? "").toLowerCase();
    if (t.includes("elite")) return 1000;
    if (t.includes("prime")) return 600;
    if (t.includes("essential")) return 400;
    return 0;
  })();

  const MENTOR_PLAN_OPTIONS: { key: string; label: string }[] = [
    { key: "mentorship_1m", label: "1 Month (₹1,999)" },
    { key: "mentorship_6m", label: "6 Months (₹5,499)" },
    { key: "mentorship_neet", label: "Till NEET 2026 (₹8,999)" },
  ];
  const toggleMentorPlan = (k: string) =>
    setMentorPlans((p) => p.includes(k) ? p.filter((x) => x !== k) : [...p, k]);

  async function create() {
    if (program === "batch" && ownerEmail && batchId === "all") {
      toast.error("Pick a specific batch for a collaborator coupon");
      return;
    }
    if (program === "mentorship" && ownerEmail) {
      toast.error("Collaborator commissions are only for batch coupons.");
      return;
    }
    setBusy(true);
    try {
      await upsert({ data: {
        code, kind, value: Number(value),
        max_uses: maxUses ? Number(maxUses) : null,
        expires_at: expires ? new Date(expires).toISOString() : null,
        program,
        batch_id: program === "batch" && batchId !== "all" ? batchId : null,
        allowed_plans: program === "mentorship" && mentorPlans.length ? mentorPlans : null,
        active,
        owner_email: ownerEmail ? ownerEmail.trim() : null,
      } });
      toast.success(ownerEmail ? "Collaborator coupon created" : "Coupon created");
      setCode(""); setValue(10); setMaxUses(""); setExpires(""); setOwnerEmail(""); setMentorPlans([]);
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5">
          <h3 className="text-lg font-semibold">Create coupon</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH50" /></div>
            <div><Label>Type</Label>
              <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent off</SelectItem>
                  <SelectItem value="flat">Flat ₹ off</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Value ({kind === "percent" ? "%" : "₹"})</Label><Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} /></div>
            <div><Label>Max uses (blank = unlimited)</Label><Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
            <div><Label>Expires</Label><Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
            <div><Label>Program</Label>
              <Select value={program} onValueChange={(v: any) => setProgram(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="batch">Batch purchase</SelectItem>
                  <SelectItem value="mentorship">Mentorship program</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {program === "batch" ? (
              <div><Label>Applies to</Label>
                <Select value={batchId} onValueChange={setBatchId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All batches</SelectItem>
                    {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="sm:col-span-2">
                <Label>Applies to mentorship plans</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MENTOR_PLAN_OPTIONS.map((p) => {
                    const on = mentorPlans.includes(p.key);
                    return (
                      <button key={p.key} type="button" onClick={() => toggleMentorPlan(p.key)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Leave all unchecked to allow every mentorship plan.</p>
              </div>
            )}
            {program === "batch" && (
              <div className="sm:col-span-2">
                <Label>Collaborator owner email (optional)</Label>
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="collab@example.com — earns commission on each redemption"
                />
                {ownerEmail && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Commission: <span className="font-bold text-emerald-600">₹{commissionPreview}</span> per active redemption
                    {batchId === "all" && " — pick a specific batch"}
                    {batchId !== "all" && commissionPreview === 0 && ` — no tier match ("${selectedBatch?.title}"). Rename batch to include Essential / Prime / Elite.`}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Active</label>
            <Button onClick={create} disabled={busy || !code}><Plus className="mr-2 h-4 w-4" /> Create</Button>
          </div>
          <p className="rounded-md bg-secondary/50 p-2 text-xs text-muted-foreground">
            Collaborator commissions by batch tier: <b>Essential ₹400</b> · <b>Prime ₹600</b> · <b>Elite ₹1000</b> per active purchase.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Existing coupons</h3>
        {coupons === null ? <Loader2 className="h-5 w-5 animate-spin" /> : coupons.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <div className="grid gap-2">
            {coupons.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="font-mono font-bold">{c.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.kind === "percent" ? `${c.value}%` : `₹${c.value}`} off • used {c.used_count}{c.max_uses ? `/${c.max_uses}` : ""} • {c.batch?.title ?? "all batches"}
                      {c.expires_at && ` • expires ${new Date(c.expires_at).toLocaleDateString()}`}
                      {!c.active && " • inactive"}
                    </div>
                    {c.owner && (
                      <div className="mt-1 text-xs">
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700">
                          Collaborator: {c.owner.full_name ?? c.owner.email ?? c.owner_user_id}
                        </span>
                        <span className="ml-2 text-emerald-700">
                          ₹{c.commission_per_redemption}/redemption
                        </span>
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete?")) { await del({ data: { id: c.id } }); refresh(); } }}><Trash2 className="h-4 w-4" /></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
