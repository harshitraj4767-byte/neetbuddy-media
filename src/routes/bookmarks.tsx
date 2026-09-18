import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SafeRichText as RichText } from "@/components/safe-rich-text";
import {
  listUserBookmarks,
  setQuizBookmark,
  type BookmarkListItemDTO,
} from "@/lib/quiz-mysql.functions";

export const Route = createFileRoute("/bookmarks")({
  head: () => ({ meta: [{ title: "Bookmarks — Neet Buddy" }] }),
  component: BookmarksPage,
});

function BookmarksPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [bookmarks, setBookmarks] = useState<BookmarkListItemDTO[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listUserBookmarks();
      setBookmarks(rows);
    } catch (e) {
      console.warn("[bookmarks] failed to load bookmarks", e);
      toast.error("Could not load your bookmarks");
      setBookmarks([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRemove(questionId: string) {
    setRemoving(questionId);
    const previous = bookmarks;
    setBookmarks((prev) => (prev ?? []).filter((b) => b.questionId !== questionId));
    try {
      await setQuizBookmark({ data: { questionId, add: false } });
      toast.success("Bookmark removed");
    } catch (e: any) {
      setBookmarks(previous);
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
            <Card key={b.id || b.questionId} className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <div className="flex items-center gap-2">
                  {b.subjectName && <Badge variant="outline">{b.subjectName}</Badge>}
                  {b.chapterName && <span className="truncate max-w-xs">{b.chapterName}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:bg-destructive/10"
                  disabled={removing === b.questionId}
                  onClick={() => handleRemove(b.questionId)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
              <div className="text-sm font-medium">
                <RichText>{b.questionHtml}</RichText>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
