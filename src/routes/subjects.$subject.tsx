import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Atom, FlaskConical, Leaf, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";

export const Route = createFileRoute("/subjects/$subject")({
  head: () => ({ meta: [{ title: "Subject Practice — Neet Buddy" }] }),
  component: SubjectPage,
});

type Chapter = { id: string; name: string; q_count?: number };

const META: Record<string, { icon: typeof Atom; tint: string }> = {
  physics: { icon: Atom, tint: "from-sky-500/10 to-blue-500/10" },
  chemistry: { icon: FlaskConical, tint: "from-amber-500/10 to-orange-500/10" },
  biology: { icon: Leaf, tint: "from-emerald-500/10 to-teal-500/10" },
  botany: { icon: Leaf, tint: "from-emerald-500/10 to-teal-500/10" },
  zoology: { icon: Leaf, tint: "from-emerald-500/10 to-teal-500/10" },
};

function SubjectPage() {
  const { subject } = Route.useParams();
  const nav = useNavigate();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [modePick, setModePick] = useState<{ chapterId?: string; title: string } | null>(null);
  const [launching, setLaunching] = useState(false);

  const cleanSubject = decodeURIComponent(subject).toLowerCase();
  const meta = META[cleanSubject] || { icon: Atom, tint: "from-primary/10 to-accent/10" };
  const Icon = meta.icon;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/quiz.php?action=getSubjectQuestions&subject=${encodeURIComponent(cleanSubject)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.chapters)) {
            setChapters(data.chapters);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load subject chapters:", e);
      }
      setLoading(false);
    })();
  }, [cleanSubject]);

  async function startQuiz(mode: QuizMode) {
    if (!modePick || launching) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/quiz.php?action=createSubjectQuiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject: cleanSubject,
          chapter_id: modePick.chapterId || null,
          count: 15,
        }),
      });
      const data = await res.json();
      if (data.test_id) {
        setModePick(null);
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode } as never });
      } else {
        toast.error(data.error || "Could not launch quiz");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error starting quiz");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <PageShell
      eyebrow="Subject Practice"
      title={cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1)}
      description={`Master ${cleanSubject} concepts with chapter-wise and mixed practice tests.`}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <span className="font-semibold">{chapters.length} Chapters available</span>
        </div>
        <Button
          size="sm"
          className="bg-gradient-primary"
          onClick={() => setModePick({ title: `All ${cleanSubject} Practice` })}
        >
          <Sparkles className="mr-1.5 h-4 w-4" /> Quick Mix Quiz
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : chapters.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No chapters available for this subject.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chapters.map((ch) => (
            <Card key={ch.id} className="hover-lift flex flex-col justify-between p-4">
              <div>
                <h3 className="text-base font-semibold leading-snug">{ch.name}</h3>
                {typeof ch.q_count === "number" && (
                  <p className="mt-1 text-xs text-muted-foreground">{ch.q_count} questions in bank</p>
                )}
              </div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setModePick({ chapterId: ch.id, title: ch.name })}
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" /> Practice
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <QuizModePicker
        open={!!modePick}
        subtitle={modePick?.title}
        onClose={() => setModePick(null)}
        onPick={(m) => startQuiz(m)}
        busy={launching}
      />
    </PageShell>
  );
}
