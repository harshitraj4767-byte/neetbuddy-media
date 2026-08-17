import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listMockCategories,
  adminUpsertMockCategory,
  adminDeleteMockCategory,
} from "@/lib/mock-categories.functions";

export const Route = createFileRoute("/admin-mock-categories")({
  head: () => ({ meta: [{ title: "Admin · Mock Categories — Neet Buddy" }] }),
  component: MockCategoriesAdmin,
});

type Row = { id: string; name: string; sort_order: number; active: boolean };

function MockCategoriesAdmin() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const list = useServerFn(listMockCategories);
  const save = useServerFn(adminUpsertMockCategory);
  const del = useServerFn(adminDeleteMockCategory);

  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [order, setOrder] = useState(50);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) nav({ to: "/dashboard" });
  }, [user, isAdmin, loading, nav]);

  const reload = () => list().then((r) => { setRows(r as Row[]); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await save({ data: { name: name.trim(), sort_order: order, active: true } });
      setName(""); setOrder(50);
      toast.success("Category added");
      reload();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  };

  const patch = async (row: Row, patch: Partial<Row>) => {
    try {
      await save({ data: { id: row.id, name: patch.name ?? row.name, sort_order: patch.sort_order ?? row.sort_order, active: patch.active ?? row.active } });
      reload();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const remove = async (row: Row) => {
    if (!confirm(`Delete category "${row.name}"? Tests keep working; they'll become "Uncategorized".`)) return;
    try { await del({ data: { id: row.id } }); reload(); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  return (
    <PageShell eyebrow="Admin" title="Mock Categories" description="Manage the filter chips shown above the Mock Tests page (e.g. CBT, RBT).">
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_140px_auto]">
          <div className="space-y-1.5">
            <Label>Category name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CBT" />
          </div>
          <div className="space-y-1.5">
            <Label>Sort order</Label>
            <Input type="number" value={order} onChange={(e) => setOrder(+e.target.value || 0)} />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={busy || !name.trim()} className="w-full bg-gradient-primary">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" /> Add</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!loaded ? <Loader2 className="h-5 w-5 animate-spin" /> :
        rows.length === 0 ? <p className="text-sm text-muted-foreground">No categories yet.</p> :
        <div className="space-y-2">
          {rows.map((r) => <EditRow key={r.id} row={r} onPatch={patch} onDelete={remove} />)}
        </div>}
    </PageShell>
  );
}

function EditRow({ row, onPatch, onDelete }: { row: Row; onPatch: (r: Row, p: Partial<Row>) => void; onDelete: (r: Row) => void }) {
  const [name, setName] = useState(row.name);
  const [order, setOrder] = useState(row.sort_order);
  const [active, setActive] = useState(row.active);
  const dirty = name !== row.name || order !== row.sort_order || active !== row.active;
  return (
    <Card>
      <CardContent className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_120px_120px_auto]">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="number" value={order} onChange={(e) => setOrder(+e.target.value || 0)} />
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} /> {active ? "Active" : "Hidden"}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => onPatch(row, { name, sort_order: order, active })}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
