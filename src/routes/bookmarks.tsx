import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, ChevronLeft, Bookmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SafeRichText as RichText } from "@/components/safe-rich-text";

export const Route = createFileRoute("/bookmarks")({
  head: () => ({ meta: [{ title: "Bookmarks — Neet Buddy" }] }),
  component: BookmarksPage,
});

type BookmarkItem = {
  id: string;
  question_id: string;
  question_text: string;
  options: string[] | { html: string }[];
  difficulty: string;
  subject_name?: string;
  chapter_name?: string;
};

function BookmarksPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [bookmarks, setBookmarks] = useState<BookmarkItem[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/bookmarks.php", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.bookmarks)) {
            setBookmarks(data.bookmarks);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load /api/bookmarks.php:", e);
      }
      setBookmarks([]);
    })();
  }, [user]);

  async function handleRemove(questionId: string) {
    setRemoving(questionId);
    try {
      const res = await fetch("/api/bookmarks.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question_id: questionId }),
      });
      if (res.ok) {
        setBookmarks((prev) => (prev ?? []).filter((b) => b.question_id !== questionId));
        toast.success("Bookmark removed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error removing bookmark");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <PageShell eyebrow="Saved" title="Bookmarks" description="Questions you bookmarked for later revision.">
      {bookmarks === null ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : bookmarks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No bookmarked questions yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {bookmarks.map((b) => (
            <Card key={b.id || b.question_id} className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <div className="flex items-center gap-2">
                  {b.subject_name && <Badge variant="outline">{b.subject_name}</Badge>}
                  {b.chapter_name && <span className="truncate max-w-xs">{b.chapter_name}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:bg-destructive/10"
                  disabled={removing === b.question_id}
                  onClick={() => handleRemove(b.question_id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
              <div className="text-sm font-medium">
                <RichText content={b.question_text} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
