import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2, PlayCircle, Filter } from "lucide-react";
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
  const [startingTest, setStartingTest] = useState(false);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>("All");
  const [selectedChapter, setSelectedChapter] = useState<string>("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("All");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  const load = useCallback(async () => {
    try {
      // First try direct API
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/mistakes.php", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.mistakes)) {
          const mapped: MistakeListItemDTO[] = json.mistakes.map((m: any) => {
            const rawText = String(m.question_text || m.question_html || "");
            const rawOpts = Array.isArray(m.options) ? m.options.map((o: any) => typeof o === "string" ? o : String(o?.text || o?.html || "")) : [];
            const withMedia = attachQuestionMedia({
              id: String(m.question_id || m.id || m.q_id),
              text: rawText,
              question_image_url: m.question_image_url || m.image_url,
              explanation_image_url: m.explanation_image_url,
              options: rawOpts,
            });
            const optsList = withMedia.options || rawOpts;
            return {
              id: String(m.id || m.question_id),
              questionId: String(m.question_id || m.id || m.q_id),
              questionHtml: withMedia.text || rawText,
              options: optsList.map((opt: string, idx: number) => ({
                index: idx,
                html: opt,
                text: opt,
              })),
              difficulty: String(m.difficulty || "medium"),
              explanation: m.explanation || null,
              correctIndex: Number(m.correct_option ?? m.correct_index ?? 0),
              subjectName: m.subject_name || null,
              chapterName: m.chapter_name || null,
              createdAt: m.created_at || null,
            };
          });
          setMistakes(mapped);
          return;
        }
      }
      const rows = await listUserMistakes();
      setMistakes(rows);
    } catch (e) {
      console.warn("Failed to load mistakes:", e);
      try {
        const rows = await listUserMistakes();
        setMistakes(rows);
      } catch {
        setMistakes([]);
        toast.error("Could not load your mistakes notebook");
      }
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
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      await fetch("/api/mistakes.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ question_id: questionId, action: "remove" }),
      });
      await setQuizWrongQuestion({ data: { questionId, add: false } }).catch(() => {});
      toast.success("Removed from mistakes notebook");
    } catch (e: unknown) {
      setMistakes(prev);
      toast.error(e instanceof Error ? e.message : "Error removing mistake");
    } finally {
      setRemoving(null);
    }
  }

  // Available subjects
  const subjects = useMemo(() => {
    if (!mistakes) return [];
    const set = new Set<string>();
    mistakes.forEach((m) => {
      if (m.subjectName) set.add(m.subjectName);
    });
    return Array.from(set).sort();
  }, [mistakes]);

  // Available chapters based on selected subject
  const chapters = useMemo(() => {
    if (!mistakes) return [];
    const set = new Set<string>();
    mistakes.forEach((m) => {
      if (selectedSubject === "All" || m.subjectName === selectedSubject) {
        if (m.chapterName) set.add(m.chapterName);
      }
    });
    return Array.from(set).sort();
  }, [mistakes, selectedSubject]);

  // Filtered mistakes
  const filtered = useMemo(() => {
    if (!mistakes) return [];
    return mistakes.filter((m) => {
      if (selectedSubject !== "All" && m.subjectName !== selectedSubject) return false;
      if (selectedChapter !== "All" && m.chapterName !== selectedChapter) return false;
      if (selectedDifficulty !== "All" && m.difficulty.toLowerCase() !== selectedDifficulty.toLowerCase())
        return false;
      return true;
    });
  }, [mistakes, selectedSubject, selectedChapter, selectedDifficulty]);

  const handleSubjectChange = (val: string) => {
    setSelectedSubject(val);
    setSelectedChapter("All");
  };

  // Reattempt filtered questions
  async function handleAttemptQuestions() {
    if (!filtered.length) {
      toast.error("No questions match the selected filters");
      return;
    }
    setStartingTest(true);
    try {
      const questionIds = filtered.map((m) => m.questionId);
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/quiz.php?action=create_custom_test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          title: `Mistakes Practice (${selectedSubject !== "All" ? selectedSubject : "All Subjects"})`,
          question_ids: questionIds,
          type: "practice",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.test_id || data?.testId) {
          nav({ to: `/quiz/${data.test_id || data.testId}` as any });
          return;
        }
      }
      throw new Error("Failed to generate test");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start test");
    } finally {
      setStartingTest(false);
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
        <div className="space-y-6">
          {/* Filters & Action */}
          <Card className="p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5" /> Filters:
                </div>

                {/* Subject filter */}
                <Select value={selectedSubject} onValueChange={handleSubjectChange}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue placeholder="Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Subjects</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Chapter filter */}
                <Select value={selectedChapter} onValueChange={setSelectedChapter}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Chapters</SelectItem>
                    {chapters.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Difficulty filter */}
                <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Difficulty</SelectItem>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>

                {(selectedSubject !== "All" || selectedChapter !== "All" || selectedDifficulty !== "All") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedSubject("All");
                      setSelectedChapter("All");
                      setSelectedDifficulty("All");
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>

              {/* Attempt Questions Button */}
              <div>
                <Button
                  size="sm"
                  className="w-full bg-gradient-primary text-xs font-medium md:w-auto"
                  disabled={startingTest || filtered.length === 0}
                  onClick={handleAttemptQuestions}
                >
                  {startingTest ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Attempt Questions ({filtered.length})
                </Button>
              </div>
            </div>
          </Card>

          {/* List of mistakes */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No mistakes match the selected filters.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((m) => (
                <Card key={m.id} className="p-4 shadow-sm transition-shadow hover:shadow">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      {m.subjectName && (
                        <Badge variant="outline" className="font-semibold">
                          {m.subjectName}
                        </Badge>
                      )}
                      {m.chapterName && (
                        <span className="max-w-xs truncate font-medium text-foreground/80">
                          {m.chapterName}
                        </span>
                      )}
                      {m.difficulty && (
                        <Badge
                          variant="secondary"
                          className={
                            m.difficulty.toLowerCase() === "easy"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : m.difficulty.toLowerCase() === "hard"
                              ? "bg-rose-500/10 text-rose-600"
                              : "bg-amber-500/10 text-amber-600"
                          }
                        >
                          {m.difficulty}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:bg-destructive/10"
                      disabled={removing === m.questionId}
                      onClick={() => handleRemove(m.questionId)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                  <div className="text-sm font-medium leading-relaxed">
                    <RichText>{m.questionHtml}</RichText>
                  </div>
                  {m.options.length > 0 && (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {m.options.map((o) => (
                        <li
                          key={o.index}
                          className={
                            o.index === m.correctIndex
                              ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700 dark:text-emerald-400"
                              : "rounded-md border border-border/40 px-3 py-1.5 text-muted-foreground"
                          }
                        >
                          <RichText>{o.html}</RichText>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.explanation && (
                    <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground/90">Explanation: </span>
                      <RichText>{m.explanation}</RichText>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
