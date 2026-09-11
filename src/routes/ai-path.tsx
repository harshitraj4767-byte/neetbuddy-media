import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Target,
  GraduationCap
} from "lucide-react";

export const Route = createFileRoute("/ai-path")({
  component: StudyRoadmapPage,
});

interface ChapterItem {
  chapter_id: string;
  chapter_name: string;
  subject_id: string;
  subject_name: string;
  redirect_url: string;
  practice_url: string;
}

interface TrackingData {
  chapters_done_yesterday: Array<{
    chapter_id: string;
    subject_id: string;
    questions_attempted: number;
    avg_accuracy: number;
  }>;
  chapters_done_today: Array<{
    chapter_id: string;
    subject_id: string;
    questions_attempted: number;
  }>;
}

function StudyRoadmapPage() {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [tracking, setTracking] = useState<TrackingData>({
    chapters_done_yesterday: [],
    chapters_done_today: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roadmap.php")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.recommended_chapters) {
          setChapters(data.recommended_chapters);
        }
        if (data?.automated_tracking) {
          setTracking(data.automated_tracking);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="Study Roadmap & Smart Path" description="Automated daily progress tracking with direct chapter practice">
      <div className="max-w-5xl mx-auto space-y-8 pb-16">
        {/* Top Activity Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Yesterday's Accomplishments */}
          <Card className="border-blue-200/50 bg-gradient-to-br from-blue-50/70 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/10 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Studied Yesterday</h3>
                  <p className="text-xs text-muted-foreground">Automated log from your practice runs</p>
                </div>
              </div>
              {tracking.chapters_done_yesterday.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {tracking.chapters_done_yesterday.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-background/80 border">
                      <span className="font-medium truncate max-w-[200px]">Chapter {c.chapter_id}</span>
                      <span className="text-muted-foreground">{c.questions_attempted} Qs • {Math.round(c.avg_accuracy || 0)}% Acc</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">No practice recorded yesterday. Jump in today to build your streak!</p>
              )}
            </CardContent>
          </Card>

          {/* Today's Target */}
          <Card className="border-emerald-200/50 bg-gradient-to-br from-emerald-50/70 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/10 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Today's Progress</h3>
                  <p className="text-xs text-muted-foreground">Live completed chapters</p>
                </div>
              </div>
              {tracking.chapters_done_today.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {tracking.chapters_done_today.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-background/80 border">
                      <span className="font-medium truncate max-w-[200px]">Chapter {c.chapter_id}</span>
                      <span className="text-emerald-600 font-semibold">{c.questions_attempted} Qs Done</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">Ready for today's study goals. Select a chapter below to start!</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Roadmap Chapters Flow */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" /> Next Milestone Chapters
              </h2>
              <p className="text-sm text-muted-foreground">Click any chapter to jump straight into study notes or practice quizzes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chapters.map((ch, idx) => (
              <Card key={ch.chapter_id || idx} className="hover:shadow-md transition-all border border-border/80 group">
                <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {ch.subject_name || "Chapter"}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                    </div>
                    <h3 className="font-semibold text-base text-foreground leading-snug group-hover:text-primary transition-colors">
                      {ch.chapter_name || ch.chapter_id}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs gap-1 h-8"
                      onClick={() => {
                        window.location.href = ch.redirect_url;
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Study
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 text-xs gap-1 h-8"
                      onClick={() => {
                        window.location.href = ch.practice_url;
                      }}
                    >
                      Practice <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
