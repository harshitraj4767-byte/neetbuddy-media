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
import { Loader2, Trash2, PlayCircle, Filter, BookOpen } from "lucide-react";
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
  const [startingTest, setStartingTest] = useState(false);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>("All");
  const [selectedChapter, setSelectedChapter] = useState<string>("All");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("All");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      // First try MySQL API
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/bookmarks.php", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.bookmarks)) {
          const mapped: BookmarkListItemDTO[] = json.bookmarks.map((b: any) => {
            const rawText = String(b.question_text || b.question_html || "");
            const withMedia = attachQuestionMedia({
              id: String(b.question_id || b.id),
              text: rawText,
              question_image_url: b.question_image_url || b.image_url,
              options: Array.isArray(b.options) ? b.options.map((o: any) => typeof o === "string" ? o : String(o?.text || o?.html || "")) : [],
            });
            return {
            id: String(b.id || b.question_id),
            questionId: String(b.question_id || b.id),
            questionHtml: withMedia.text || rawText,
            options: Array.isArray(b.options)
              ? b.options.map((opt: any, idx: number) => ({
                  index: idx,
                  html: typeof opt === "string" ? opt : String(opt?.text || opt?.html || ""),
                  text: typeof opt === "string" ? opt : String(opt?.text || opt?.html || ""),
                }))
              : [],
            difficulty: String(b.difficulty || "medium"),
            subjectName: b.subject_name || null,
            chapterName: b.chapter_name || null,
            createdAt: b.created_at || null,
          }; });
          setBookmarks(mapped);
          return;
        }
      }
      // Fallback
      const rows = await listUserBookmarks();
      setBookmarks(rows);
    } catch (e) {
      console.warn("[bookmarks] failed to load bookmarks", e);
      try {
        const rows = await listUserBookmarks();
        setBookmarks(rows);
      } catch {
        toast.error("Could not load your bookmarks");
        setBookmarks([]);
      }
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
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      await fetch("/api/bookmarks.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ question_id: questionId, action: "remove", add: false }),
      });
      await setQuizBookmark({ data: { questionId, add: false } }).catch(() => {});
      toast.success("Bookmark removed");
    } catch (e: any) {
      setBookmarks(previous);
      toast.error(e?.message ?? "Error removing bookmark");
    } finally {
      setRemoving(null);
    }
  }

  // Available subjects from bookmarks
  const subjects = useMemo(() => {
    if (!bookmarks) return [];
    const set = new Set<string>();
    bookmarks.forEach((b) => {
      if (b.subjectName) set.add(b.subjectName);
    });
    return Array.from(set).sort();
  }, [bookmarks]);

  // Available chapters based on selected subject
  const chapters = useMemo(() => {
    if (!bookmarks) return [];
    const set = new Set<string>();
    bookmarks.forEach((b) => {
      if (selectedSubject === "All" || b.subjectName === selectedSubject) {
        if (b.chapterName) set.add(b.chapterName);
      }
    });
    return Array.from(set).sort();
  }, [bookmarks, selectedSubject]);

  // Filtered bookmarks
  const filtered = useMemo(() => {
    if (!bookmarks) return [];
    return bookmarks.filter((b) => {
      if (selectedSubject !== "All" && b.subjectName !== selectedSubject) return false;
      if (selectedChapter !== "All" && b.chapterName !== selectedChapter) return false;
      if (selectedDifficulty !== "All" && b.difficulty.toLowerCase() !== selectedDifficulty.toLowerCase())
        return false;
      return true;
    });
  }, [bookmarks, selectedSubject, selectedChapter, selectedDifficulty]);

  // Reset chapter if subject changes
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
      const questionIds = filtered.map((b) => b.questionId);
      const token = localStorage.getItem("auth_token") || localStorage.getItem("nb_token");
      const res = await fetch("/api/quiz.php?action=create_custom_test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          title: `Bookmarks Practice (${selectedSubject !== "All" ? selectedSubject : "All Subjects"})`,
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
      eyebrow="Saved"
      title="Bookmarks"
      description="Questions you bookmarked for later revision."
    >
      {bookmarks === null ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : bookmarks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No bookmarked questions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Controls & Filters */}
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

          {/* List of bookmarks in rich mistake-like card format */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No bookmarks match the selected filters.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((b) => (
                <Card key={b.id || b.questionId} className="p-4 shadow-sm transition-shadow hover:shadow">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      {b.subjectName && (
                        <Badge variant="outline" className="font-semibold">
                          {b.subjectName}
                        </Badge>
                      )}
                      {b.chapterName && (
                        <span className="max-w-xs truncate font-medium text-foreground/80">
                          {b.chapterName}
                        </span>
                      )}
                      {b.difficulty && (
                        <Badge
                          variant="secondary"
                          className={
                            b.difficulty.toLowerCase() === "easy"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : b.difficulty.toLowerCase() === "hard"
                              ? "bg-rose-500/10 text-rose-600"
                              : "bg-amber-500/10 text-amber-600"
                          }
                        >
                          {b.difficulty}
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive hover:bg-destructive/10"
                      disabled={removing === b.questionId}
                      onClick={() => handleRemove(b.questionId)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>

                  <div className="text-sm font-medium leading-relaxed">
                    <RichText>{b.questionHtml}</RichText>
                  </div>

                  {b.options.length > 0 && (
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {b.options.map((o) => (
                        <li
                          key={o.index}
                          className="rounded-md border border-border/50 bg-muted/20 px-3 py-1.5 text-foreground/90"
                        >
                          <RichText>{o.html}</RichText>
                        </li>
                      ))}
                    </ul>
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
