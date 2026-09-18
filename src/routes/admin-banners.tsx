import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  ExternalLink,
  ImagePlus,
  RefreshCw,
  Upload,
  Sun,
  Moon,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

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

type Banner = {
  id: string;
  title: string | null;
  image_url: string;
  image_url_dark?: string | null;
  link_url: string;
  sort_order: number;
  active: boolean | number;
};

function BannersAdmin() {
  const { user, profile, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== "admin")) {
      // Allow access if admin check or let user see
    }
  }, [user, profile, authLoading, nav]);

  const loadBanners = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/admin.php?action=banners", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load banners");
      const data = await res.json();
      setBanners(Array.isArray(data?.banners) ? data.banners : []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load banners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBanners();
  }, []);

  const handleSave = async (b: Partial<Banner>) => {
    const bannerId = b.id || "new";
    setSavingId(bannerId);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/admin.php?action=banners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          id: b.id,
          title: b.title || "",
          image_url: b.image_url || "",
          image_url_dark: b.image_url_dark || null,
          link_url: b.link_url || "",
          sort_order: Number(b.sort_order ?? 10),
          active: b.active ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save banner");
      toast.success("Banner saved successfully");
      await loadBanners();
    } catch (e: any) {
      toast.error(e?.message ?? "Error saving banner");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;
    setDeletingId(id);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/admin.php?action=delete_banner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete banner");
      toast.success("Banner deleted");
      setBanners((prev) => prev.filter((item) => item.id !== id));
    } catch (e: any) {
      toast.error(e?.message ?? "Error deleting banner");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("WARNING: This will permanently delete ALL banners from the database. Proceed?")) {
      return;
    }
    setDeletingAll(true);
    try {
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/admin.php?action=delete_all_banners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to delete all banners");
      toast.success("All banners have been deleted");
      setBanners([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Error deleting all banners");
    } finally {
      setDeletingAll(false);
    }
  };

  const handleAddNew = () => {
    const tempId = "temp_" + Date.now();
    setBanners((prev) => [
      {
        id: tempId,
        title: "New Banner",
        image_url: "",
        image_url_dark: "",
        link_url: "/quiz/daily",
        sort_order: (prev.length + 1) * 10,
        active: 1,
      },
      ...prev,
    ]);
  };

  return (
    <PageShell
      eyebrow="Admin Portal"
      title="Dashboard Banners"
      description="Upload banner artwork for light & dark themes, set click destinations, and manage ordering."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button onClick={handleAddNew} size="sm" className="bg-gradient-primary">
              <Plus className="mr-1.5 h-4 w-4" /> Add Banner
            </Button>
            <Button
              onClick={loadBanners}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>

          <Button
            onClick={handleDeleteAll}
            variant="destructive"
            size="sm"
            disabled={deletingAll || banners.length === 0}
          >
            {deletingAll ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-4 w-4" />
            )}
            Delete All Banners
          </Button>
        </div>

        {/* Expected Banner Ratio Info Box */}
        <Card className="border-primary/20 bg-primary/5 p-4 text-xs">
          <div className="font-semibold text-primary">Recommended Banner Artwork Dimensions:</div>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted-foreground">
            <li><strong>Desktop:</strong> 3:1 ratio (1200 × 400 px or 1500 × 500 px)</li>
            <li><strong>Mobile:</strong> 16:9 ratio (1080 × 608 px)</li>
            <li><strong>Universal (Recommended):</strong> 2.5:1 ratio (1250 × 500 px), keeping logos and primary text centered within the middle 70% of the image.</li>
            <li><strong>Dark Mode Variant:</strong> Upload an optional dark version suited for dark theme viewports. If omitted, the light banner will be used.</li>
          </ul>
        </Card>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : banners.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              No banners found in the database. Click <strong>Add Banner</strong> above to create one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {banners.map((b, idx) => (
              <BannerItem
                key={b.id || idx}
                banner={b}
                onSave={handleSave}
                onDelete={handleDelete}
                isSaving={savingId === b.id}
                isDeleting={deletingId === b.id}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

async function uploadBannerFile(file: File): Promise<string> {
  const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");

  // Attempt multipart/form-data first
  try {
    const formData = new FormData();
    formData.append("action", "upload_banner");
    formData.append("image", file);

    const res = await fetch("/api/admin.php?action=upload_banner", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.url) return data.url;
    }
  } catch (err) {
    console.warn("Multipart upload failed, trying base64 fallback:", err);
  }

  // Fallback: Base64 data URI
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const res = await fetch("/api/admin.php?action=upload_banner", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: "include",
          body: JSON.stringify({
            action: "upload_banner",
            image_data: base64Data,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || data?.message || "Upload failed");
        }
        resolve(data.url);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function BannerItem({
  banner,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  banner: Banner;
  onSave: (b: Partial<Banner>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState(banner.title || "");
  const [imageUrl, setImageUrl] = useState(banner.image_url || "");
  const [imageUrlDark, setImageUrlDark] = useState(banner.image_url_dark || "");
  const [linkUrl, setLinkUrl] = useState(banner.link_url || "");
  const [sortOrder, setSortOrder] = useState(banner.sort_order ?? 10);
  const [active, setActive] = useState(Boolean(banner.active));

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [previewTab, setPreviewTab] = useState<"light" | "dark">("light");

  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  const isTemp = banner.id.startsWith("temp_");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, variant: "light" | "dark") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (variant === "light") setUploadingLight(true);
    else setUploadingDark(true);

    try {
      toast.info(`Uploading ${variant} banner artwork...`);
      const url = await uploadBannerFile(file);
      if (variant === "light") {
        setImageUrl(url);
        toast.success("Light banner uploaded!");
      } else {
        setImageUrlDark(url);
        toast.success("Dark banner uploaded!");
      }
    } catch (err: any) {
      toast.error(err?.message || `Failed to upload ${variant} banner`);
    } finally {
      if (variant === "light") setUploadingLight(false);
      else setUploadingDark(false);
      e.target.value = "";
    }
  };

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">
            {title || "Untitled Banner"}
          </CardTitle>
          {isTemp && (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 bg-gradient-primary text-xs"
            disabled={isSaving || uploadingLight || uploadingDark}
            onClick={() =>
              onSave({
                id: isTemp ? undefined : banner.id,
                title,
                image_url: imageUrl,
                image_url_dark: imageUrlDark || null,
                link_url: linkUrl,
                sort_order: sortOrder,
                active: active ? 1 : 0,
              })
            }
          >
            {isSaving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>

          {!isTemp && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              disabled={isDeleting}
              onClick={() => onDelete(banner.id)}
            >
              {isDeleting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Delete
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-5 lg:grid-cols-2">
        {/* Left: Inputs */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Banner Title / Campaign Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NEET 2026 Crash Course / Mock Test Series"
              className="h-9 text-xs"
            />
          </div>

          {/* Light Mode Artwork Upload */}
          <div className="space-y-1.5 rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <Sun className="h-3.5 w-3.5 text-amber-500" /> Light Theme Banner (Default)
              </Label>
              {imageUrl && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Image set
                </span>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                ref={lightInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => handleFileChange(e, "light")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                disabled={uploadingLight}
                onClick={() => lightInputRef.current?.click()}
              >
                {uploadingLight ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload File
              </Button>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste image URL / CDN path"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Dark Mode Artwork Upload */}
          <div className="space-y-1.5 rounded-lg border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <Moon className="h-3.5 w-3.5 text-sky-400" /> Dark Theme Banner (Optional)
              </Label>
              {imageUrlDark ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Dark variant set
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Uses light banner if omitted</span>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                ref={darkInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                onChange={(e) => handleFileChange(e, "dark")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                disabled={uploadingDark}
                onClick={() => darkInputRef.current?.click()}
              >
                {uploadingDark ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload File
              </Button>
              <Input
                value={imageUrlDark}
                onChange={(e) => setImageUrlDark(e.target.value)}
                placeholder="Or paste dark image URL / CDN path"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Click Destination / Route</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="e.g. /pyqs, /quiz/daily, or external https://..."
              className="h-9 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col justify-center space-y-1.5">
              <Label className="text-xs font-medium">Active on Dashboard</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-xs text-muted-foreground">
                  {active ? "Visible" : "Hidden"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview with Light / Dark Tabs */}
        <div className="flex flex-col justify-between space-y-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Live Banner Preview:</span>
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewTab("light")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
                    previewTab === "light"
                      ? "bg-primary text-primary-foreground font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sun className="h-3 w-3" /> Light
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab("dark")}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition ${
                    previewTab === "dark"
                      ? "bg-primary text-primary-foreground font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Moon className="h-3 w-3" /> Dark
                </button>
              </div>
            </div>

            {previewTab === "light" ? (
              imageUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <img
                    src={imageUrl}
                    alt={title || "Light Banner Preview"}
                    className="aspect-[2.5/1] w-full rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="mt-1 px-1 text-right text-[10px] text-slate-500">Light theme preview</div>
                </div>
              ) : (
                <div className="flex aspect-[2.5/1] w-full flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-white/70 text-xs text-muted-foreground">
                  <ImagePlus className="mb-1.5 h-6 w-6 text-muted-foreground/50" />
                  <span>Upload or enter a Light Banner image</span>
                </div>
              )
            ) : (
              (imageUrlDark || imageUrl) ? (
                <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-1 shadow-sm">
                  <img
                    src={imageUrlDark || imageUrl}
                    alt={title || "Dark Banner Preview"}
                    className="aspect-[2.5/1] w-full rounded-lg object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="mt-1 px-1 text-right text-[10px] text-slate-400">
                    Dark theme preview {imageUrlDark ? "" : "(using light artwork fallback)"}
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[2.5/1] w-full flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-slate-950/70 text-xs text-muted-foreground">
                  <ImagePlus className="mb-1.5 h-6 w-6 text-muted-foreground/50" />
                  <span>Upload or enter a Dark Banner image</span>
                </div>
              )
            )}
          </div>

          {linkUrl && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ExternalLink className="h-3 w-3" /> Target: <code className="text-foreground">{linkUrl}</code>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
