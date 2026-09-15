import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Check, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/generate")({
  head: () => ({ meta: [{ title: "Generate Custom Test — Neet Buddy" }] }),
  component: GeneratePage,
});

type Subject = { id: string; name: string };
type Chapter = { id: string; name: string; subject_id: string };

function GeneratePage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [count, setCount] = useState(15);
  const [difficulty, setDifficulty] = useState<"mix" | "easy" | "medium" | "hard">("mix");
  const [timer, setTimer] = useState(20);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/quiz.php?action=getSubjectTree");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.subjects)) setSubjects(data.subjects);
          if (Array.isArray(data.chapters)) setChapters(data.chapters);
        }
      } catch (e) {
        console.warn("Failed to load subject tree:", e);
      }
    })();
  }, []);

  function toggleSubject(id: string) {
    setSelectedSubjects((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleChapter(id: string) {
    setSelectedChapters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const availableChapters = chapters.filter(
    (c) => selectedSubjects.length === 0 || selectedSubjects.includes(c.subject_id)
  );

  async function handleGenerate() {
    if (launching) return;
    setLaunching(true);
    try {
      const res = await fetch("/api/quiz.php?action=generateCustomTest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject_ids: selectedSubjects,
          chapter_ids: selectedChapters,
          total_questions: count,
          duration_min: timer,
          difficulty,
        }),
      });
      const data = await res.json();
      if (data.test_id) {
        toast.success("Custom test created!");
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode: "exam" } as never });
      } else {
        toast.error(data.error || "Could not generate test");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error generating test");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <PageShell eyebrow="Build your test" title="Test Generator" description="Pick your subjects, chapters, and challenge level.">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 font-semibold">1. Choose Subjects</h3>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => {
                  const sel = selectedSubjects.includes(s.id);
                  return (
                    <Button
                      key={s.id}
                      variant={sel ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleSubject(s.id)}
                    >
                      {sel && <Check className="mr-1.5 h-3.5 w-3.5" />}
                      {s.name}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 font-semibold">2. Choose Chapters (Optional)</h3>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {availableChapters.map((c) => {
                  const sel = selectedChapters.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleChapter(c.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg p-2 text-sm transition-colors",
                        sel ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"
                      )}
                    >
                      <span>{c.name}</span>
                      {sel && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">3. Test Parameters</h3>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Question Count</label>
                <div className="flex gap-2">
                  {[10, 15, 20, 30, 45].map((n) => (
                    <Button
                      key={n}
                      size="sm"
                      variant={count === n ? "default" : "outline"}
                      onClick={() => setCount(n)}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Difficulty</label>
                <div className="flex gap-2">
                  {(["mix", "easy", "medium", "hard"] as const).map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={difficulty === d ? "default" : "outline"}
                      className="capitalize"
                      onClick={() => setDifficulty(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardContent className="p-5 space-y-4">
              <h3 className="font-semibold">Ready to begin?</h3>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>• {count} Questions</p>
                <p>• {timer} Minutes duration</p>
                <p>• {difficulty} difficulty</p>
              </div>
              <Button
                className="w-full bg-gradient-primary"
                size="lg"
                disabled={launching}
                onClick={handleGenerate}
              >
                {launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate & Start Test
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
