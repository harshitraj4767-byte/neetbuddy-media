import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MissionBanner } from "@/components/mission-banner";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { HubHero } from "@/components/nav-tiles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { BookOpenCheck, ChevronRight, Filter, Loader2, Sparkles, Trophy, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/chapter-pyqs")({
  head: () => ({
    meta: [
      { title: "Chapter Wise PYQs — Neet Buddy" },
      {
        name: "description",
        content: "Practice 10.2k+ previous year questions arranged chapter wise from NEET, JEE, AIIMS, AIPMT, KCET, MHT CET and TS EAMCET in quiz mode or real CBT mode.",
      },
    ],
  }),
  component: ChapterPyqsPage,
});

type ChapterRow = {
  id: string | number;
  name: string;
  subject_name?: string | null;
  pyq_count?: number;
};

function ChapterPyqsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>("All");
  const [modePick, setModePick] = useState<ChapterRow | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pyqs.php?action=chapters");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.chapters)) {
            setChapters(data.chapters);
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load /api/pyqs.php?action=chapters:", e);
      }
      setLoading(false);
    })();
  }, []);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    chapters.forEach((c) => {
      if (c.subject_name) set.add(c.subject_name);
    });
    return ["All", ...Array.from(set).sort()];
  }, [chapters]);

  const filteredChapters = useMemo(() => {
    if (selectedSubject === "All") return chapters;
    return chapters.filter((c) => c.subject_name === selectedSubject);
  }, [chapters, selectedSubject]);

  async function handleStart(chapter: ChapterRow, mode: QuizMode) {
    setStarting(true);
    try {
      const res = await fetch("/api/pyqs.php?action=get_or_create_chapter_test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chapter_id: chapter.id }),
      });
      const data = await res.json();
      if (data.test_id) {
        setModePick(null);
        nav({ to: "/quiz/$testId", params: { testId: data.test_id }, search: { mode } as never });
      } else {
        toast.error("Could not load chapter test");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Error launching test");
    } finally {
      setStarting(false);
    }
  }

  return (
    <PageShell eyebrow="Practice" title="Chapter-wise PYQs" description="Master previous year questions chapter by chapter.">
      <div className="mb-6 flex flex-wrap gap-2">
        {subjects.map((sub) => (
          <Button
            key={sub}
            variant={selectedSubject === sub ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedSubject(sub)}
          >
            {sub}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredChapters.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No chapters found.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredChapters.map((ch) => (
            <Card key={ch.id} className="hover-lift flex flex-col justify-between p-4">
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <Badge variant="outline">{ch.subject_name || "General"}</Badge>
                  <span>{ch.pyq_count ?? 0} PYQs</span>
                </div>
                <h3 className="mt-2 text-base font-semibold leading-snug">{ch.name}</h3>
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" className="w-full" onClick={() => setModePick(ch)}>
                  Practice Now
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <QuizModePicker
        open={!!modePick}
        subtitle={modePick?.name}
        onClose={() => setModePick(null)}
        onPick={(m) => modePick && handleStart(modePick, m)}
        busy={starting}
      />
    </PageShell>
  );
}
