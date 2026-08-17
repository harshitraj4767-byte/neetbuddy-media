import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Trophy, ImagePlus, Video, X } from "lucide-react";
import {
  adminListSelections,
  adminUpsertSelection,
  adminDeleteSelection,
  adminCreateSelectionUploadUrl,
} from "@/lib/selections.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MediaItem = { type: "image" | "video"; url: string };

const empty = () => ({
  id: undefined as string | undefined,
  student_name: "",
  exam_year: null as number | null,
  rank_text: "" as string | null,
  college: "" as string | null,
  story: "" as string | null,
  media: [] as MediaItem[],
  featured: true,
  sort_order: 0,
});

export function AdminSelectionsTab() {
  const [list, setList] = useState<any[] | null>(null);
  const [draft, setDraft] = useState(empty());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  const listFn = useServerFn(adminListSelections);
  const upsert = useServerFn(adminUpsertSelection);
  const del = useServerFn(adminDeleteSelection);
  const uploadUrl = useServerFn(adminCreateSelectionUploadUrl);

  async function refresh() {
    const r = await listFn();
    setList(r as any[]);
  }
  useEffect(() => { refresh().catch((e: any) => toast.error(e.message)); }, []);

  async function onUpload(files: FileList | null, kind: "image" | "video") {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const added: MediaItem[] = [];
      for (const f of Array.from(files)) {
        const r = await uploadUrl({ data: { filename: f.name, kind } });
        const { error } = await supabase.storage
          .from("selection-results")
          .uploadToSignedUrl(r.path, r.token, f, { contentType: f.type });
        if (error) throw error;
        added.push({ type: kind, url: r.public_url });
      }
      setDraft({ ...draft, media: [...draft.media, ...added] });
      toast.success(`${added.length} ${kind}${added.length === 1 ? "" : "s"} uploaded`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft.student_name.trim()) return toast.error("Student name required");
    setBusy(true);
    try {
      await upsert({
        data: {
          ...draft,
          student_name: draft.student_name.trim(),
          rank_text: draft.rank_text || null,
          college: draft.college || null,
          story: draft.story || null,
          exam_year: draft.exam_year ?? null,
          sort_order: Number(draft.sort_order || 0),
        },
      });
      toast.success("Selection saved");
      setDraft(empty());
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this selection result?")) return;
    await del({ data: { id } });
    await refresh();
  }

  function edit(s: any) {
    setDraft({
      id: s.id,
      student_name: s.student_name,
      exam_year: s.exam_year,
      rank_text: s.rank_text,
      college: s.college,
      story: s.story,
      media: (s.media ?? []) as MediaItem[],
      featured: s.featured,
      sort_order: s.sort_order,
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">{draft.id ? "Edit selection" : "Add NEET selection result"}</h3>
            </div>
            {draft.id && <Button variant="ghost" size="sm" onClick={() => setDraft(empty())}>Cancel</Button>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Student name</Label><Input value={draft.student_name} onChange={(e) => setDraft({ ...draft, student_name: e.target.value })} /></div>
            <div><Label>NEET Year</Label><Input type="number" value={draft.exam_year ?? ""} onChange={(e) => setDraft({ ...draft, exam_year: e.target.value ? Number(e.target.value) : null })} placeholder="2026" /></div>
            <div><Label>Rank / marks</Label><Input value={draft.rank_text ?? ""} onChange={(e) => setDraft({ ...draft, rank_text: e.target.value })} placeholder="AIR 2145 · 685 marks" /></div>
            <div><Label>College</Label><Input value={draft.college ?? ""} onChange={(e) => setDraft({ ...draft, college: e.target.value })} placeholder="AIIMS Delhi" /></div>
            <div className="sm:col-span-2"><Label>Story / testimonial</Label><Textarea rows={4} value={draft.story ?? ""} onChange={(e) => setDraft({ ...draft, story: e.target.value })} /></div>
          </div>

          <div>
            <Label>Media (images & videos — select multiple)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input ref={imgRef} type="file" accept="image/*" multiple hidden onChange={(e) => onUpload(e.target.files, "image")} />
              <input ref={vidRef} type="file" accept="video/*" multiple hidden onChange={(e) => onUpload(e.target.files, "video")} />
              <Button variant="secondary" onClick={() => imgRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />} Upload images
              </Button>
              <Button variant="secondary" onClick={() => vidRef.current?.click()} disabled={uploading}>
                <Video className="mr-2 h-4 w-4" /> Upload videos
              </Button>
            </div>
            {draft.media.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {draft.media.map((m, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg border bg-muted">
                    {m.type === "image" ? (
                      <img src={m.url} alt="" className="h-28 w-full object-cover" />
                    ) : (
                      <video src={m.url} className="h-28 w-full object-cover" muted />
                    )}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, media: draft.media.filter((_, j) => j !== i) })}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{m.type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2"><Switch checked={draft.featured} onCheckedChange={(v) => setDraft({ ...draft, featured: v })} /> Featured (show publicly)</label>
            <div><Label>Sort order</Label><Input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></div>
            <Button onClick={save} disabled={busy} className="self-end">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {draft.id ? "Update" : "Add selection"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">All selections</h3>
        {list === null ? <Loader2 className="h-5 w-5 animate-spin" /> : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No selection results yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex gap-3 p-3">
                  {s.media?.[0]?.type === "image" && (
                    <img src={s.media[0].url} alt="" className="h-20 w-24 rounded-lg object-cover" />
                  )}
                  {s.media?.[0]?.type === "video" && (
                    <video src={s.media[0].url} className="h-20 w-24 rounded-lg object-cover" muted />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{s.student_name} {!s.featured && <span className="ml-1 text-xs text-muted-foreground">(hidden)</span>}</div>
                    <div className="text-xs text-muted-foreground">{[s.rank_text, s.college, s.exam_year].filter(Boolean).join(" · ")}</div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => edit(s)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></Button>
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