import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Save, ExternalLink, Upload, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { APP_DESTINATIONS } from "@/lib/app-destinations";
import {
  adminListBanners,
  adminUpsertBanner,
  adminDeleteBanner,
  adminCreateBannerUploadUrl,
  type BannerRow,
} from "@/lib/banners.functions";

export const Route = createFileRoute("/admin-banners")({
  head: () => ({
    meta: [
      { title: "Admin · Dashboard Banners — Neet Buddy" },
      { name: "description", content: "Upload banner artwork and pick where each banner sends students." },
      { property: "og:title", content: "Admin · Dashboard Banners — Neet Buddy" },
      { property: "og:description", content: "Manage dashboard banner images, destinations and ordering." },
    ],
  }),
  component: BannersAdmin,
});

const EMPTY = { title: "", image_url: "", link_url: "", sort_order: 50, active: true };
const CUSTOM = "__custom__";
const NONE = "__none__";

/** Upload artwork straight into storage and return its public URL. */
function ImageField({
  value,
  onChange,
  idPrefix,
}: {
  value: string;
  onChange: (url: string) => void;
  idPrefix: string;
}) {
  const createUrl = useServerFn(adminCreateBannerUploadUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    if (file.size > 10 * 1024 * 1024) return toast.error("Image must be under 10 MB");
    setUploading(true);
    try {
      const r = await createUrl({ data: { filename: file.name } });
      const { error } = await supabase.storage
        .from("banner-images")
        .uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
      if (error) throw error;
      onChange(r.public_url);
      toast.success("Banner image uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={`${idPrefix}-file`}>Banner image (1200 × 450)</Label>
      {value ? (
        <div className="overflow-hidden rounded-2xl border border-border">
          <img src={value} alt="Banner preview" className="aspect-[8/3] w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[8/3] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
          <ImagePlus className="mr-2 h-4 w-4" /> No image yet
        </div>
      )}
      <input
        id={`${idPrefix}-file`}
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploading}
          onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          {value ? "Replace image" : "Upload image"}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Pick an in-app destination path (preferred) or a custom path / external link. */
function DestinationField({
  value,
  onChange,
  idPrefix,
}: {
  value: string;
  onChange: (v: string) => void;
  idPrefix: string;
}) {
  const known = APP_DESTINATIONS.some((d) => d.path === value);
  const [custom, setCustom] = useState(!!value && !known);
  const select = custom ? CUSTOM : value ? value : NONE;

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={`${idPrefix}-dest`}>Destination</Label>
      <Select
        value={select}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(v === NONE ? "" : v);
        }}
      >
        <SelectTrigger id={`${idPrefix}-dest`}>
          <SelectValue placeholder="Where should this banner go?" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={NONE}>No link (image only)</SelectItem>
          {APP_DESTINATIONS.map((d) => (
            <SelectItem key={d.path} value={d.path}>
              {d.label} — {d.path}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom path or external link…</SelectItem>
        </SelectContent>
      </Select>
      {custom ? (
        <Input
          value={value}
          placeholder="/batches or https://example.com"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      <p className="text-xs text-muted-foreground">
        In-app paths like <code>/batches</code> are stored as-is, so the banner keeps working even if
        the app URL changes later.
      </p>
    </div>
  );
}

function BannersAdmin() {
  const { user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const list = useServerFn(adminListBanners);
  const save = useServerFn(adminUpsertBanner);
  const del = useServerFn(adminDeleteBanner);

  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) nav({ to: "/dashboard" });
  }, [user, isAdmin, loading, nav]);

  const reload = async () => {
    try {
      setRows(await list());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load banners");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (user && isAdmin) void reload();
  }, [user?.id, isAdmin]);

  const create = async () => {
    if (!form.image_url.trim()) return toast.error("Upload a banner image first");
    setBusy(true);
    try {
      await save({
        data: {
          title: form.title || null,
          image_url: form.image_url.trim(),
          link_url: form.link_url.trim() || null,
          sort_order: Number(form.sort_order) || 0,
          active: form.active,
        },
      });
      setForm({ ...EMPTY });
      toast.success("Banner added");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save banner");
    } finally {
      setBusy(false);
    }
  };

  const update = async (row: BannerRow) => {
    setBusy(true);
    try {
      await save({
        data: {
          id: row.id,
          title: row.title,
          image_url: row.image_url,
          link_url: row.link_url?.trim() || null,
          sort_order: row.sort_order,
          active: row.active,
        },
      });
      toast.success("Saved");
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save banner");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await del({ data: { id } });
      setRows((r) => r.filter((x) => x.id !== id));
      toast.success("Banner deleted");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete banner");
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, p: Partial<BannerRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));

  if (loading || !user || !isAdmin) {
    return (
      <PageShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Dashboard Banners</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Banners appear directly below the dashboard hero card and auto-slide every 10 seconds.
            Upload artwork in an <strong>8:3 ratio (≈2.67:1)</strong> — recommended 1200 × 450 px.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-bold">Add a banner</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-title">Title (internal)</Label>
                <Input id="b-title" value={form.title} placeholder="Summer batch promo"
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-order">Sort order</Label>
                <Input id="b-order" type="number" value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <ImageField idPrefix="new" value={form.image_url}
                onChange={(url) => setForm({ ...form, image_url: url })} />
              <DestinationField idPrefix="new" value={form.link_url}
                onChange={(v) => setForm({ ...form, link_url: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="b-active" checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <Label htmlFor="b-active">Active</Label>
              </div>
              <Button onClick={create} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add banner
              </Button>
            </div>
          </CardContent>
        </Card>

        {!loaded ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No banners yet.</p>
        ) : (
          rows.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input value={row.title ?? ""} onChange={(e) => patch(row.id, { title: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sort order</Label>
                    <Input type="number" value={row.sort_order}
                      onChange={(e) => patch(row.id, { sort_order: Number(e.target.value) })} />
                  </div>
                  <ImageField idPrefix={row.id} value={row.image_url}
                    onChange={(url) => patch(row.id, { image_url: url })} />
                  <DestinationField idPrefix={row.id} value={row.link_url ?? ""}
                    onChange={(v) => patch(row.id, { link_url: v })} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={row.active} onCheckedChange={(v) => patch(row.id, { active: v })} />
                    <span className="text-sm">Active</span>
                    {row.link_url ? (
                      <a href={row.link_url} target="_blank" rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" /> Open link
                      </a>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => update(row)} disabled={busy}>
                      <Save className="mr-2 h-4 w-4" /> Save
                    </Button>
                    <Button variant="destructive" onClick={() => remove(row.id)} disabled={busy}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageShell>
  );
}
