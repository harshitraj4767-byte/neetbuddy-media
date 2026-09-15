import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SafeRichText as RichText } from "@/components/safe-rich-text";

export const Route = createFileRoute("/mistakes")({
  head: () => ({ meta: [{ title: "My Mistakes — Neet Buddy" }] }),
  component: MistakesPage,
});

type MistakeItem = {
  id: string;
  question_id: string;
  question_text: string;
  options: string[] | { html: string }[];
  difficulty: string;
  subject_name?: string;
  chapter_name?: string;
  created_at: string;
};

function MistakesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [mistakes, setMistakes] = useState<MistakeItem[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mistakes.php", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.mistakes)) {
            setMistakes(data.mistakes);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load /api/mistakes.php:", e);
      }
      setMistakes([]);
    })();
  }, [user]);

  async function handleRemove(questionId: string) {
    setRemoving(questionId);
    try {
      const res = await fetch("/api/mistakes.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question_id: questionId }),
      });
      if (res.ok) {
        setMistakes((prev) => (prev ?? []).filter((m) => m.question_id !== questionId));
        toast.success("Removed from mistakes notebook");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error removing mistake");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <PageShell eyebrow="Revision" title="Mistakes Notebook" description="Review questions you got wrong to turn weak areas into strengths.">
      {mistakes === null ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : mistakes.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No recorded mistakes yet! Keep practicing.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {mistakes.map((m) => (
            <Card key={m.id || m.question_id} className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <div className="flex items-center gap-2">
                  {m.subject_name && <Badge variant="outline">{m.subject_name}</Badge>}
                  {m.chapter_name && <span className="truncate max-w-xs">{m.chapter_name}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:bg-destructive/10"
                  disabled={removing === m.question_id}
                  onClick={() => handleRemove(m.question_id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
              <div className="text-sm font-medium">
                <RichText content={m.question_text} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
