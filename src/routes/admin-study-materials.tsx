import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Upload, FolderUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  adminBulkAddStudyMaterials,
  adminListStudyMaterials,
  adminDeleteStudyMaterial,
  MATERIAL_TYPES,
  type MaterialType,
} from "@/lib/study-materials.functions";
import { parseLenientJson } from "@/lib/json-utils";


export const Route = createFileRoute("/admin-study-materials")({
  head: () => ({ meta: [{ title: "Admin · Study Materials — Neet Buddy" }] }),
  component: AdminStudyMaterialsPage,
});

type Draft = {
  subject: string;
  chapter: string;
  material_type: MaterialType;
  title: string;
  pdf_url: string;
  is_coming_soon: boolean;
};

const emptyDraft = (): Draft => ({
  subject: "",
  chapter: "",
  material_type: "short_notes",
  title: "",
  pdf_url: "",
  is_coming_soon: false,
});

function AdminStudyMaterialsPage() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const bulkAdd = useServerFn(adminBulkAddStudyMaterials);
  const list = useServerFn(adminListStudyMaterials);
  const del = useServerFn(adminDeleteStudyMaterial);

  const [rows, setRows] = useState<Draft[]>([emptyDraft()]);
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [existing, setExisting] = useState<any[] | null>(null);
  const [uploadDefaults, setUploadDefaults] = useState<{ subject: string; material_type: MaterialType }>({ subject: "", material_type: "short_notes" });
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => { if (!loading && (!user || !isAdmin)) nav({ to: "/dashboard" }); }, [user, isAdmin, loading, nav]);

  const reload = () => list().then((r) => setExisting(r as any[])).catch(() => setExisting([]));
  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  const submitRows = async (payload: Draft[]) => {
    const cleaned = payload
      .filter((r) => r.subject.trim() && r.chapter.trim() && r.title.trim())
      .map((r) => ({
        subject: r.subject.trim(),
        chapter: r.chapter.trim(),
        material_type: r.material_type,
        title: r.title.trim(),
        pdf_url: r.pdf_url.trim() || null,
        is_coming_soon: r.is_coming_soon || !r.pdf_url.trim(),
      }));
    if (!cleaned.length) { toast.error("Add at least one row"); return; }
    setBusy(true);
    try {
      const res = await bulkAdd({ data: { rows: cleaned } });
      toast.success(`Added ${res.created} of ${cleaned.length} materials`);
      setLogs(res.logs);
      if (res.created) { setRows([emptyDraft()]); reload(); }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  };

  const submitJson = async () => {
    try {
      const parsed = parseLenientJson(jsonText);
      const arr = Array.isArray(parsed) ? parsed : (parsed as any)?.rows;
      if (!Array.isArray(arr)) throw new Error("JSON must be an array of rows");
      const drafts: Draft[] = arr.map((r: any) => ({
        subject: String(r.subject ?? ""),
        chapter: String(r.chapter ?? ""),
        material_type: (r.material_type ?? r.type ?? "mind_map") as MaterialType,
        title: String(r.title ?? ""),
        pdf_url: String(r.pdf_url ?? r.url ?? ""),
        is_coming_soon: Boolean(r.is_coming_soon ?? r.coming_soon ?? false),
      }));
      await submitRows(drafts);
      setJsonText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid JSON");
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!uploadDefaults.subject.trim()) {
      toast.error("Set the default Subject for uploads first");
      return;
    }
    setUploadProgress({ done: 0, total: files.length });
    const drafts: Draft[] = [];
    let i = 0;
    for (const file of Array.from(files)) {
      try {
        const relPath: string = (file as any).webkitRelativePath || file.name;
        // Chapter name = parent folder if present, otherwise the file base name.
        const parts = relPath.split("/").filter(Boolean);
        const base = (parts.length > 1 ? parts[parts.length - 2] : parts[parts.length - 1] || file.name)
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        const chapter = base || "Uncategorized";
        const title = (file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()) || chapter;
        const safe = relPath.replace(/[^a-zA-Z0-9._/-]+/g, "_");
        const key = `${uploadDefaults.material_type}/${Date.now()}_${i}_${safe}`;
        const { error } = await supabase.storage.from("study-materials").upload(key, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw error;
        const { data } = supabase.storage.from("study-materials").getPublicUrl(key);
        drafts.push({
          subject: uploadDefaults.subject.trim(),
          chapter,
          material_type: uploadDefaults.material_type,
          title,
          pdf_url: data.publicUrl,
          is_coming_soon: false,
        });
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "upload failed"}`);
      }
      i++;
      setUploadProgress({ done: i, total: files.length });
    }
    setUploadProgress(null);
    if (drafts.length) await submitRows(drafts);
  };


  const updateRow = (i: number, patch: Partial<Draft>) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeRow = (i: number) => setRows((rs) => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);

  if (loading) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <PageShell
      eyebrow="Admin"
      title="Study Materials"
      description="Bulk upload mind maps, formula sheets and short notes. Rows without a PDF link automatically become 'Coming soon'."
    >
      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Bulk file / folder upload</h3>
          <p className="text-xs text-muted-foreground">Pick the subject &amp; material type, then upload a folder. Each file becomes one row; the <b>parent folder name</b> (or file name) is used as the chapter automatically.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Default Subject</Label>
              <Input value={uploadDefaults.subject} onChange={(e) => setUploadDefaults((s) => ({ ...s, subject: e.target.value }))} placeholder="e.g. Physics" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Material Type</Label>
              <Select value={uploadDefaults.material_type} onValueChange={(v) => setUploadDefaults((s) => ({ ...s, material_type: v as MaterialType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MATERIAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
            <input ref={folderInputRef} type="file" hidden multiple onChange={(e) => uploadFiles(e.target.files)} {...({ webkitdirectory: "", directory: "" } as any)} />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!!uploadProgress}>
              <Upload className="mr-2 h-4 w-4" /> Upload files
            </Button>
            <Button type="button" variant="outline" onClick={() => folderInputRef.current?.click()} disabled={!!uploadProgress}>
              <FolderUp className="mr-2 h-4 w-4" /> Upload folder
            </Button>
            {uploadProgress && (
              <span className="self-center text-xs text-muted-foreground">
                Uploading {uploadProgress.done}/{uploadProgress.total}…
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">

        <CardContent className="space-y-4 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Add materials</h3>
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_160px]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Input value={row.subject} onChange={(e) => updateRow(i, { subject: e.target.value })} placeholder="e.g. Physics" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chapter</Label>
                  <Input value={row.chapter} onChange={(e) => updateRow(i, { chapter: e.target.value })} placeholder="e.g. Kinematics" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select value={row.material_type} onValueChange={(v) => updateRow(i, { material_type: v as MaterialType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Title</Label>
                  <Input value={row.title} onChange={(e) => updateRow(i, { title: e.target.value })} placeholder="e.g. Kinematics — Complete mind map" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">PDF URL (optional)</Label>
                  <Input value={row.pdf_url} onChange={(e) => updateRow(i, { pdf_url: e.target.value })} placeholder="https://..." />
                </div>
                <div className="flex items-center justify-between gap-2 sm:col-span-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={row.is_coming_soon} onCheckedChange={(v) => updateRow(i, { is_coming_soon: v })} />
                    Mark as coming soon
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, emptyDraft()])}>
              <Plus className="mr-1 h-4 w-4" /> Add row
            </Button>
            <Button size="sm" onClick={() => submitRows(rows)} disabled={busy} className="bg-gradient-primary">
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Save {rows.length} row{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Or paste JSON (bulk)</h3>
          <p className="text-xs text-muted-foreground">
            Array of rows: <code className="rounded bg-muted px-1">{`{ "subject": "Physics", "chapter": "Kinematics", "material_type": "mind_map", "title": "...", "pdf_url": "https://..." }`}</code>
          </p>
          <Textarea rows={8} value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs" placeholder='[ { "subject": "Physics", "chapter": "Kinematics", "material_type": "formula_sheet", "title": "All formulas", "pdf_url": "https://..." } ]' />
          <Button size="sm" onClick={submitJson} disabled={busy || !jsonText.trim()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Import JSON
          </Button>
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">Last import log</h3>
            <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-2 text-xs">{logs.join("\n")}</pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">Existing materials</h3>
          {!existing ? <Loader2 className="h-5 w-5 animate-spin" /> :
            existing.length === 0 ? <p className="text-sm text-muted-foreground">No materials yet.</p> :
            <div className="space-y-2">
              {existing.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.subjects?.name} · {m.chapters?.name} · {MATERIAL_TYPES.find((t) => t.value === m.material_type)?.label ?? m.material_type}
                      {m.is_coming_soon ? " · Coming soon" : ""}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={async () => {
                    if (!confirm("Delete this material?")) return;
                    try { await del({ data: { id: m.id } }); toast.success("Deleted"); reload(); }
                    catch (e: any) { toast.error(e?.message ?? "Failed"); }
                  }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>}
        </CardContent>
      </Card>
    </PageShell>
  );
}
