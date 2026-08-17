import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, Sparkles, ImagePlus } from "lucide-react";
import { adminListBatches, adminUpsertBatch, adminDeleteBatch, adminGenerateBatchDescription, adminCreateBatchImageUploadUrl } from "@/lib/batches.functions";
import { FEATURE_LABEL_MAP, FEATURE_KEYS } from "@/lib/feature-labels";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Batch = any;

const empty = () => ({
  id: undefined as string | undefined,
  title: "",
  image_url: null as string | null,
  price: 999,
  discounted_price: 499,
  duration_days: 30,
  features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<string, boolean>,
  ai_description: "" as string | null,
  short_tagline: "" as string | null,
  active: true,
  sort_order: 0,
});

export function AdminBatchesTab() {
  const [list, setList] = useState<Batch[] | null>(null);
  const [draft, setDraft] = useState(empty());
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listFn = useServerFn(adminListBatches);
  const upsert = useServerFn(adminUpsertBatch);
  const del = useServerFn(adminDeleteBatch);
  const genAi = useServerFn(adminGenerateBatchDescription);
  const uploadUrl = useServerFn(adminCreateBatchImageUploadUrl);

  async function refresh() {
    const r = await listFn();
    setList(r as any[]);
  }
  useEffect(() => { refresh().catch((e) => toast.error(e.message)); }, []);

  async function onUpload(f: File) {
    setUploading(true);
    try {
      const r = await uploadUrl({ data: { filename: f.name } });
      const { error } = await supabase.storage.from("batch-images").uploadToSignedUrl(r.path, r.token, f, { contentType: f.type });
      if (error) throw error;
      setDraft({ ...draft, image_url: r.public_url });
      toast.success("Image uploaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  async function generate() {
    if (!draft.title) return toast.error("Add a title first");
    setAiBusy(true);
    try {
      const r = await genAi({ data: { title: draft.title, features: draft.features, duration_days: draft.duration_days, price: draft.price, discounted_price: draft.discounted_price } });
      setDraft({ ...draft, ai_description: r.description });
      toast.success("AI description generated");
    } catch (e: any) { toast.error(e.message); }
    finally { setAiBusy(false); }
  }

  async function save() {
    setBusy(true);
    try {
      await upsert({ data: { ...draft, price: Number(draft.price), discounted_price: Number(draft.discounted_price), duration_days: Number(draft.duration_days), sort_order: Number(draft.sort_order) } });
      toast.success("Saved");
      setDraft(empty());
      await refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete batch?")) return;
    await del({ data: { id } }); await refresh();
  }

  function edit(b: Batch) {
    setDraft({
      id: b.id, title: b.title, image_url: b.image_url, price: Number(b.price), discounted_price: Number(b.discounted_price),
      duration_days: b.duration_days, features: b.features ?? {}, ai_description: b.ai_description, short_tagline: b.short_tagline,
      active: b.active, sort_order: b.sort_order,
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{draft.id ? "Edit batch" : "Add new batch"}</h3>
            {draft.id && <Button variant="ghost" size="sm" onClick={() => setDraft(empty())}>Cancel</Button>}
          </div>

          <div>
            <Label>Cover image</Label>
            <div className="mt-2 flex items-center gap-3">
              {draft.image_url ? (
                <img src={draft.image_url} alt="" className="h-24 w-32 rounded-lg object-cover" />
              ) : (
                <div className="flex h-24 w-32 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ImagePlus className="h-8 w-8" /></div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Upload
              </Button>
              {draft.image_url && <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, image_url: null })}>Remove</Button>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Title</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div><Label>Tagline (optional)</Label><Input value={draft.short_tagline ?? ""} onChange={(e) => setDraft({ ...draft, short_tagline: e.target.value })} /></div>
            <div><Label>Price (₹)</Label><Input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} /></div>
            <div><Label>Discounted price (₹)</Label><Input type="number" value={draft.discounted_price} onChange={(e) => setDraft({ ...draft, discounted_price: Number(e.target.value) })} /></div>
            <div><Label>Duration (days)</Label><Input type="number" value={draft.duration_days} onChange={(e) => setDraft({ ...draft, duration_days: Number(e.target.value) })} /></div>
            <div><Label>Sort order</Label><Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></div>
          </div>

          <div>
            <Label>Features included</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
              {FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!draft.features[k]} onCheckedChange={(v) => setDraft({ ...draft, features: { ...draft.features, [k]: !!v } })} />
                  {FEATURE_LABEL_MAP[k]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>User-facing description (AI generated)</Label>
              <Button size="sm" variant="secondary" onClick={generate} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Generate with AI
              </Button>
            </div>
            <Textarea rows={5} value={draft.ai_description ?? ""} onChange={(e) => setDraft({ ...draft, ai_description: e.target.value })} placeholder="Click 'Generate with AI' to auto-fill." />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} /> Active</label>
            <Button onClick={save} disabled={busy || !draft.title}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} {draft.id ? "Update batch" : "Create batch"}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">All batches</h3>
        {list === null ? <Loader2 className="h-5 w-5 animate-spin" /> : list.length === 0 ? <p className="text-sm text-muted-foreground">No batches yet.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((b) => (
              <Card key={b.id}>
                <CardContent className="flex gap-3 p-3">
                  {b.image_url && <img src={b.image_url} alt="" className="h-20 w-24 rounded-lg object-cover" />}
                  <div className="flex-1">
                    <div className="font-semibold">{b.title} {!b.active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}</div>
                    <div className="text-xs text-muted-foreground">₹{b.discounted_price} • {b.duration_days}d</div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => edit(b)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
