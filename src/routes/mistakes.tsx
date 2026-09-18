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
  listUserMistakes,
  setQuizWrongQuestion,
  type MistakeListItemDTO,
} from "@/lib/quiz-mysql.functions";

export const Route = createFileRoute("/mistakes")({
  head: () => ({
    meta: [
      { title: "My Mistakes — Neet Buddy" },
      {
        name: "description",
        content: "Revise every question you got wrong and turn weak areas into strengths.",
      },
    ],
  }),
  component: MistakesPage,
});

function MistakesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [mistakes, setMistakes] = useState<MistakeListItemDTO[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  const load = useCallback(async () => {
    try {
      const rows = await listUserMistakes();
      setMistakes(rows);
    } catch (e) {
      console.warn("Failed to load mistakes:", e);
      setMistakes([]);
      toast.error("Could not load your mistakes notebook");
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setMistakes([]);
      return;
    }
    void load();
  }, [user, loading, load]);

  async function handleRemove(questionId: string) {
    const prev = mistakes ?? [];
    setRemoving(questionId);
    setMistakes(prev.filter((m) => m.questionId !== questionId));
    try {
      await setQuizWrongQuestion({ data: { questionId, add: false } });
      toast.success("Removed from mistakes notebook");
    } catch (e: unknown) {
      setMistakes(prev);
      toast.error(e instanceof Error ? e.message : "Error removing mistake");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <PageShell
      eyebrow="Revision"
      title="Mistakes Notebook"
      description="Review questions you got wrong to turn weak areas into strengths."
    >
      {mistakes === null ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : mistakes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No recorded mistakes yet! Keep practicing.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mistakes.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {m.subjectName && <Badge variant="outline">{m.subjectName}</Badge>}
                  {m.chapterName && <span className="max-w-xs truncate">{m.chapterName}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:bg-destructive/10"
                  disabled={removing === m.questionId}
                  onClick={() => handleRemove(m.questionId)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Remove
                </Button>
              </div>
              <div className="text-sm font-medium">
                <RichText>{m.questionHtml}</RichText>
              </div>
              {m.options.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {m.options.map((o) => (
                    <li
                      key={o.index}
                      className={
                        o.index === m.correctIndex
                          ? "rounded-md bg-primary/10 px-2 py-1 font-medium text-primary"
                          : "px-2 py-1 text-muted-foreground"
                      }
                    >
                      <RichText>{o.html}</RichText>
                    </li>
                  ))}
                </ul>
              )}
              {m.explanation && (
                <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  <RichText>{m.explanation}</RichText>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
