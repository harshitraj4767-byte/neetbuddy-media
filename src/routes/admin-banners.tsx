import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, Trash2, Save, ExternalLink, ImagePlus, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { APP_DESTINATIONS } from "@/lib/app-destinations";

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
  link_url: string;
  sort_order: number;
  active: boolean | number;
};

const EMPTY: Omit<Banner, "id"> & { id?: string } = {
  title: "",
  image_url: "",
  link_url: "",
  sort_order: 10,
  active: 1,
};

const CUSTOM = "__custom__";
const NONE = "__none__";

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
      description="Create, update, toggle, or delete banners displayed on student dashboards."
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
  const [linkUrl, setLinkUrl] = useState(banner.link_url || "");
  const [sortOrder, setSortOrder] = useState(banner.sort_order ?? 10);
  const [active, setActive] = useState(Boolean(banner.active));

  const isTemp = banner.id.startsWith("temp_");

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
            disabled={isSaving}
            onClick={() =>
              onSave({
                id: isTemp ? undefined : banner.id,
                title,
                image_url: imageUrl,
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

      <CardContent className="grid gap-6 p-5 md:grid-cols-2">
        {/* Left: Inputs */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Banner Title / Campaign Name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NEET 2026 Crash Course / Mock Test Series"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Image URL (Direct image link / CDN)</Label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... or /img/banners/banner1.jpg"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Click Destination / Route</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="e.g. /pyqs, /quiz/daily, or external https://..."
              className="h-9 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="h-9 text-xs"
              />
            </div>
            <div className="flex flex-col justify-center space-y-1.5">
              <Label className="text-xs">Active on Dashboard</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-xs text-muted-foreground">
                  {active ? "Visible" : "Hidden"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col justify-between space-y-2 rounded-xl border border-dashed border-border bg-muted/20 p-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-muted-foreground">Live Banner Preview:</div>
            {imageUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border shadow-sm">
                <img
                  src={imageUrl}
                  alt={title || "Banner Preview"}
                  className="aspect-[2.5/1] w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="flex aspect-[2.5/1] w-full flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 text-xs text-muted-foreground">
                <ImagePlus className="mb-1.5 h-6 w-6 text-muted-foreground/50" />
                <span>Enter an Image URL to preview</span>
              </div>
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
