import { publicMediaAsset } from "@/lib/media-assets";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { attachQuestionMedia } from "@/lib/question-media";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQuizPageTest,
  getQuizPageQuestions,
  getQuizUserMarks,
  getLatestQuizAttempt,
  getContestPriorAttempt,
  getActiveBattleMatch,
  getAttemptWrongReasons,
  setQuizBookmark,
  setQuizWrongQuestion,
  saveQuizProgress,
  submitQuizPageAttempt,
  submitBattleScore,
} from "@/lib/quiz-mysql.functions";
import { pyqBadge } from "@/lib/exam-labels";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CheckCircle2, Loader2, X, Bookmark, GraduationCap, Flag, Trophy, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SafeRichText as RichText } from "@/components/safe-rich-text";
import { ReportQuestionButton } from "@/components/report-question-button";
import { AntiCheatGate, hasAckedAntiCheat } from "@/components/anti-cheat-gate";
import { ReasonBreakdown } from "@/components/reason-breakdown";
import { SaveQuestionSheet } from "@/components/save-question-sheet";
import { LoadingScreen } from "@/components/loading-screen";
import { useForceLightMode } from "@/hooks/use-force-light";

function getQuizStorageKey(testId: string, mode: string) {
  return `quiz_state_${testId}_${mode}`;
}

type PersistedQuizState = {
  answers: Record<string, number>;
  idx: number;
  visited: string[];
  marked: string[];
  endTime?: number;
};

function loadQuizState(testId: string, mode: string): PersistedQuizState | null {
  try {
    const raw = localStorage.getItem(getQuizStorageKey(testId, mode));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}



export const Route = createFileRoute("/quiz/$testId")({
  head: () => ({
    meta: [
      { title: "NEET Quiz — Neet Buddy" },
      { name: "description", content: "Take a NEET practice quiz with diagrams, math questions, saved progress, and detailed results." },
      { property: "og:title", content: "NEET Quiz — Neet Buddy" },
      { property: "og:description", content: "Take a NEET practice quiz with diagrams, math questions, saved progress, and detailed results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { mode?: "quiz" | "exam" | "cbt" } => ({
    mode: (s.mode === "quiz" ? "quiz" : s.mode === "cbt" ? "cbt" : "exam") as "quiz" | "exam" | "cbt",
  }),
  component: QuizPlayer,
});

type Question = {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
  difficulty: string;
  source: string;
  marks_correct: number;
  marks_wrong: number;
  explanation?: string | null;
  subject_id?: string | null;
  chapter_id?: string | null;
  tag?: string | null;
  year?: number | null;
  is_pyq?: boolean | null;
};
type Test = {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  duration_min: number;
  total_questions: number;
  source: string;
  question_ids: string[];
  marks_correct: number;
  marks_wrong: number;
};
type Lookup = Record<string, string>;
type NameLookupRow = { id: string; name: string };
type SavedQuizProgress = {
  answers: Record<string, number>;
  idx: number;
  bookmarks: string[];
  visited: string[];
  marked: string[];
  deadline: number | null;
};

function diffClass(d: string) {
  const k = d?.toLowerCase();
  if (k === "easy")
    return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30";
  if (k === "hard")
    return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30";
  return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30";
}

function QuizPlayer() {
  // Exam surfaces stay in light mode so question images stay legible.
  useForceLightMode();
  const { testId } = Route.useParams();
  const { mode } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Lookup>({});
  const [chapters, setChapters] = useState<Lookup>({});
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [wrongMarks, setWrongMarks] = useState<Set<string>>(new Set());
  // Questions currently sitting in the user's "My Mistakes" list (any mode).
  const [mistakeSaved, setMistakeSaved] = useState<Set<string>>(new Set());
  const [saveSheet, setSaveSheet] = useState(false);
  const isCbt = mode === "cbt";
  // In CBT mode the experience mirrors NTA: timer, no in-quiz review, palette-driven.
  const isExam = mode === "exam" || isCbt;
  const isQuiz = mode === "quiz";
  // Chapter-wise practice = no submit, persist answers, lock-on-pick reveal.
  // CBT mode is always exam-style (timer + submit), even for practice sets.
  const isChapterPractice = test?.type === "practice" && !isCbt;
  // Per-question CBT status: 'not_visited' | 'not_answered' | 'answered' | 'marked' | 'marked_answered'
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    score: number;
    correct: number;
    wrong: number;
    unattempted: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [battleMatchId, setBattleMatchId] = useState<string | null>(null);
  const [contestDone, setContestDone] = useState<null | { score: number; correct: number; wrong: number; attempted: number }>(null);
  const [alreadyAttempted, setAlreadyAttempted] = useState<null | { contestId: string | null; score: number | null }>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const deadlineRef = useRef<number | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const isContest = test?.type === "contest";
  const isMock = test?.type === "mock";


  useEffect(() => {
    if (!authLoading && !user) nav({ to: "/login" });
  }, [user, authLoading, nav]);

  useEffect(() => {
    (async () => {
      let t: any = null;
      try {
        t = await getQuizPageTest({ data: { testId } });
      } catch (err) {
        console.warn("[quiz] getQuizPageTest failed, trying /api/quiz.php fallback", err);
      }

      if (!t) {
        try {
          const res = await fetch(`/api/quiz.php?action=getQuizTest&testId=${encodeURIComponent(testId)}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            if (data?.test) {
              const raw = data.test;
              let qids = raw.question_ids;
              if (typeof qids === "string") {
                try { qids = JSON.parse(qids); } catch { qids = qids.split(",").map((s: string) => s.trim()); }
              }
              t = {
                id: String(raw.id),
                title: String(raw.title || ""),
                type: String(raw.type || "quiz"),
                difficulty: String(raw.difficulty || "medium"),
                duration_min: Number(raw.duration_min || 30),
                total_questions: Number(raw.total_questions || 0),
                source: String(raw.source || "NCERT"),
                question_ids: Array.isArray(qids) ? qids.map(String) : [],
                marks_correct: Number(raw.marks_correct ?? 4),
                marks_wrong: Number(raw.marks_wrong ?? -1),
              };
            }
          }
        } catch (e) {
          console.warn("[quiz] /api/quiz.php fallback error", e);
        }
      }

      if (!t) {
        toast.error("Test not found");
        setLoading(false);
        return;
      }
      setTest(t as Test);

      // Contest re-attempt guard: contests are one-shot per user.
      // If a completed attempt already exists for this user/contest test, block.
      if (user && (t as Test).type === "contest") {
        const prior = await getContestPriorAttempt({ data: { testId } });
        if (prior?.id) {
          setAlreadyAttempted({
            contestId: prior.contestId ?? null,
            score: typeof prior.score === "number" ? prior.score : null,
          });
          setLoading(false);
          return;
        }
      }

      // Battlegrounds override: if this test is the current battle for the user,
      // cap to 10 questions / 5 minutes regardless of the underlying test's config.
      let battleActive = false;
      if (user) {
        const bm = await getActiveBattleMatch({ data: { testId } });
        if (bm?.id) {
          battleActive = bm.joined;
          if (bm.joined) setBattleMatchId(bm.id);
        }
      }

      const totalSeconds = battleActive ? 5 * 60 : (t.duration_min ?? 30) * 60;
      setSecondsLeft(totalSeconds);
      deadlineRef.current = mode === "exam" || mode === "cbt"
        ? Date.now() + totalSeconds * 1000
        : null;
      let ids = (t.question_ids as string[]) ?? [];
      if (battleActive) ids = ids.slice(0, 5);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      let bank: any = null;
      try {
        bank = await getQuizPageQuestions({
          data: {
            questionIds: ids,
            marksCorrect: Number(t.marks_correct ?? 4) || 4,
            marksWrong: Number(t.marks_wrong ?? -1),
          },
        });
      } catch (err) {
        console.warn("[quiz] getQuizPageQuestions failed, trying /api/quiz.php fallback", err);
      }

      if (!bank || !bank.questions || bank.questions.length === 0) {
        try {
          const res = await fetch("/api/quiz.php?action=getQuizQuestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ testId, questionIds: ids }),
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.questions)) {
              // The PHP fallback returns image fields in camelCase; keep them
              // (as the snake_case names attachQuestionMedia expects) or the
              // quiz renders every question without its picture.
              const diagrams: Record<string, string[]> = {};
              for (const q of data.questions) {
                const ids = Array.isArray(q.diagramIds) ? q.diagramIds.map(String) : [];
                if (ids.length) diagrams[String(q.id)] = ids;
              }
              bank = {
                questions: data.questions.map((q: any) => ({
                  id: String(q.id),
                  text: q.questionHtml || q.text || "",
                  options: (q.options || []).map((o: any) => typeof o === "string" ? o : (o.text || o.html || o.value || "")),
                  correct_index: Number(q.correctIndex ?? q.correct_index ?? 0),
                  difficulty: q.difficulty || t.difficulty || "medium",
                  source: t.source || "NCERT",
                  marks_correct: Number(t.marks_correct ?? 4),
                  marks_wrong: Number(t.marks_wrong ?? -1),
                  explanation: q.explanation || null,
                  question_image_url: q.questionImageUrl ?? q.question_image_url ?? null,
                  explanation_image_url: q.explanationImageUrl ?? q.explanation_image_url ?? null,
                  subject_id: q.subjectId ? String(q.subjectId) : null,
                  chapter_id: q.chapterId ? String(q.chapterId) : null,
                  tag: q.tag || null,
                  year: q.year || null,
                  is_pyq: Boolean(q.isPyq),
                })),
                subjects: {},
                chapters: {},
                diagrams,
                optionImages: {},
              };
            }
          }
        } catch (e) {
          console.warn("[quiz] fallback /api/quiz.php questions error", e);
        }
      }

      const questionsList = bank?.questions || [];
      const byId = new Map(questionsList.map((q: any) => [q.id, q as Question]));
      let ordered = ids.map((id: string) => byId.get(String(id))).filter(Boolean) as Question[];
      if (ordered.length === 0 && questionsList.length > 0) {
        ordered = questionsList as Question[];
      }

      const subjMap = bank?.subjects || {};
      setSubjects(subjMap);
      setChapters(bank?.chapters || {});

      // Mock tests: enforce Physics → Chemistry → Biology ordering
      if ((t as Test).type === "mock") {
        const rank = (sid: string | null | undefined) => {
          const sname = (sid ? subjMap[sid] || "" : "").toLowerCase();
          if (sname.includes("phy")) return 0;
          if (sname.includes("chem")) return 1;
          if (sname.includes("bio") || sname.includes("bot") || sname.includes("zoo")) return 2;
          return 4;
        };
        ordered = [...ordered].sort((a, b) => {
          const ra = rank(a.subject_id);
          const rb = rank(b.subject_id);
          if (ra !== rb) return ra - rb;
          return ids.indexOf(a.id) - ids.indexOf(b.id);
        });
      }
      // Attach every image source (DB `question_image_url`, question_diagrams
      // rows, option images, convention-named explanation files) as markdown
      // image references so <RichText /> renders them. Shared with the review
      // page via attachQuestionMedia so both stay in sync.
      try {
        ordered = ordered.map((q) =>
          attachQuestionMedia(q, {
            // Optional chaining: the PHP fallback bank has no diagram /
            // option-image maps, and a throw here used to strip the images
            // off every question in the set.
            diagramUrls: (bank?.diagrams?.[q.id] ?? []).map((id: string) => `/api/public/diagram/${id}`),
            optionImageIndexes: bank?.optionImages?.[q.id]
              ? new Set<number>(bank.optionImages[q.id])
              : undefined,
          }),
        );
      } catch (e) {
        console.warn("[quiz] failed to load question assets", e);
      }

      // Questions come from a database VIEW that does not project
      // marks_correct / marks_wrong — those live on the test row.
      // Backfill each question with the test's marking scheme so scoring
      // and analysis compute non-NaN values.
      const mcPerQ = Number((t as Test).marks_correct ?? 4) || 4;
      const mwPerQ = Number((t as Test).marks_wrong ?? -1);
      ordered = ordered.map((q) => ({
        ...q,
        marks_correct: (q as any).marks_correct ?? mcPerQ,
        marks_wrong: (q as any).marks_wrong ?? mwPerQ,
      }));
      setQuestions(ordered);


      // Preload existing bookmarks + persistent wrong marks for these questions.
      // IMPORTANT: Only chapter-wise practice quizzes resume the previous attempt
      // (answers + bookmarks). Daily / mock / live tests always start fresh.
      // CBT sets never resume: each attempt is a fresh timed paper.
      const isPracticeTest = (t as Test).type === "practice" && mode !== "cbt";
      if (user) {
        const marks = await getQuizUserMarks({ data: { questionIds: ids } });
        const existingBm = marks.bookmarks;
        const existingWrong = marks.wrong;
        if (existingBm.length) setBookmarks(new Set(existingBm));
        if (existingWrong.length) setMistakeSaved(new Set(existingWrong));
        // Only show prior wrong marking on chapter-wise practice. For daily / live /
        // mock quizzes the user wants a clean slate every attempt.
        if (isPracticeTest && existingWrong.length) {
          setWrongMarks(new Set(existingWrong));
        }
        if (isPracticeTest) {
          const prev = await getLatestQuizAttempt({ data: { testId } });
          if (prev) {
            setAttemptId(prev.id);
            if (prev.answers && typeof prev.answers === "object")
              setAnswers(prev.answers as Record<string, number>);
            if (Array.isArray(prev.bookmarks))
              setBookmarks((b) => new Set([...b, ...(prev.bookmarks as string[])]));
          }
        }
      }

      // Every unfinished test survives a browser refresh. Database attempts
      // remain the durable source for practice; this local snapshot also
      // covers exam, mock, CBT, battle and contest modes without write lag.
      if (user) {
        try {
          const key = `quiz-progress:${user.id}:${testId}:${mode}`;
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const saved = JSON.parse(raw) as Partial<SavedQuizProgress>;
            if (saved.answers && typeof saved.answers === "object") setAnswers(saved.answers);
            if (Array.isArray(saved.bookmarks)) {
              const savedBookmarks = saved.bookmarks;
              setBookmarks((b) => new Set([...b, ...savedBookmarks]));
            }
            if (Array.isArray(saved.visited)) setVisited(new Set(saved.visited));
            if (Array.isArray(saved.marked)) setMarked(new Set(saved.marked));
            if (Number.isInteger(saved.idx)) setIdx(Math.max(0, Math.min(ordered.length - 1, saved.idx ?? 0)));
            if (typeof saved.deadline === "number" && (mode === "exam" || mode === "cbt")) {
              deadlineRef.current = saved.deadline;
              setSecondsLeft(Math.max(0, Math.ceil((saved.deadline - Date.now()) / 1000)));
            }
          }
        } catch (error) {
          console.warn("[quiz] could not restore local progress", error);
        }
      }

      setProgressReady(true);
      setLoading(false);
      startedAt.current = Date.now();
    })();
  }, [testId, user?.id, mode]);

  useEffect(() => {
    if (!progressReady || !user || loading || submitted || questions.length === 0) return;
    const key = `quiz-progress:${user.id}:${testId}:${mode}`;
    const saved: SavedQuizProgress = {
      answers,
      idx,
      bookmarks: Array.from(bookmarks),
      visited: Array.from(visited),
      marked: Array.from(marked),
      deadline: isExam ? deadlineRef.current : null,
    };
    window.localStorage.setItem(key, JSON.stringify(saved));
  }, [answers, bookmarks, idx, isExam, loading, marked, mode, progressReady, questions.length, secondsLeft, submitted, testId, user, visited]);

  const clearSavedProgress = useCallback(() => {
    if (!user) return;
    window.localStorage.removeItem(`quiz-progress:${user.id}:${testId}:${mode}`);
  }, [mode, testId, user]);

  // Persist answers in real-time for chapter-wise quizzes (no submit button).
  const persistAnswers = async (next: Record<string, number>) => {
    if (!user || !isChapterPractice) return;
    const { attemptId: savedId } = await saveQuizProgress({
      data: {
        testId,
        attemptId,
        answers: next,
        bookmarks: Array.from(bookmarks),
      },
    });
    if (savedId && savedId !== attemptId) setAttemptId(savedId);
  };

  const submit = useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    let correct = 0,
      wrong = 0,
      score = 0;
    const wrongRows: { questionId: string; chapterId: string | null }[] = [];
    for (const q of questions) {
      const ans = answers[q.id];
      if (ans === undefined) continue;
      if (ans === q.correct_index) {
        correct++;
        score += q.marks_correct;
      } else {
        wrong++;
        score += q.marks_wrong;
        if (user) wrongRows.push({ questionId: q.id, chapterId: q.chapter_id ?? null });
      }
    }
    const unattempted = questions.length - correct - wrong;
    const result = { score, correct, wrong, unattempted };
    if (user) {
      let finalAttemptId = "";
      try {
        const submitRes = await submitQuizPageAttempt({
          data: {
            testId,
            answers,
            bookmarks: Array.from(bookmarks),
            score,
            correctCount: correct,
            wrongCount: wrong,
            unattemptedCount: unattempted,
            timeTakenSec: Math.floor((Date.now() - startedAt.current) / 1000),
            wrongQuestions: wrongRows,
          },
        });
        if (submitRes?.attemptId) {
          finalAttemptId = finalAttemptId;
        }
      } catch (err) {
        console.warn("[quiz] submitQuizPageAttempt failed, trying /api/quiz.php fallback", err);
      }

      if (!finalAttemptId) {
        try {
          const res = await fetch("/api/quiz.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              action: "submitQuizAttempt",
              testId,
              answers,
              bookmarks: Array.from(bookmarks),
              score,
              correctCount: correct,
              wrongCount: wrong,
              unattemptedCount: unattempted,
              timeTakenSec: Math.floor((Date.now() - startedAt.current) / 1000),
              wrongQuestions: wrongRows,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.attemptId) finalAttemptId = data.attemptId;
          }
        } catch (e) {
          console.error("[quiz] /api/quiz.php submit fallback error", e);
        }
      }

      if (finalAttemptId) clearSavedProgress();

      if (finalAttemptId) {
        // Battlegrounds: submit score to the match and go to the battle result page.
        if (battleMatchId) {
          try {
            await submitBattleScore({ data: { matchId: battleMatchId, score } });
          } catch {
            /* result page will surface errors */
          }
          nav({ to: "/battle/$matchId/result", params: { matchId: battleMatchId } });
          return;
        }
        // For contests: NEVER navigate to analysis. Show a "results awaiting" modal.
        if (test?.type === "contest") {
          setContestDone({ score, correct, wrong, attempted: correct + wrong });
          setSubmitting(false);
          return;
        }
        nav({ to: "/analysis/$attemptId", params: { attemptId: finalAttemptId } });
        return;
      }
    }
    setSubmitted(result);
    setSubmitting(false);
  }, [answers, bookmarks, nav, questions, submitted, submitting, testId, user, test, battleMatchId, clearSavedProgress]);

  useEffect(() => {
    if (loading || submitted || !isExam) return;
    if (secondsLeft <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, loading, submitted, isExam, submit]);

  // ===== Contest anti-cheat =====
  // Disable text copy / selection / context menu on the whole document while
  // a contest is in progress. Reverted on cleanup.
  useEffect(() => {
    if (!isContest || submitted || contestDone || alreadyAttempted) return;
    const block = (e: Event) => { e.preventDefault(); return false; };
    const keyBlock = (e: KeyboardEvent) => {
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      if (k === "PrintScreen" || (e.shiftKey && (k === "S" || k === "s") && e.metaKey) || k === "F12") {
        e.preventDefault();
        toast.error("Screenshots are disabled during a contest.");
        return;
      }
      if (ctrl && ["c","C","v","V","x","X","s","S","p","P","u","U"].includes(k)) {
        e.preventDefault();
        toast.error("That shortcut is disabled during a contest.");
      }
      if (ctrl && e.shiftKey && ["I","i","J","j","C","c"].includes(k)) e.preventDefault();
    };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("keydown", keyBlock, true);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    // Screen-share / cast detection — auto-submits if user starts mirroring.
    let pollId: ReturnType<typeof setInterval> | null = null;
    const perms = (navigator as any).permissions;
    if (perms?.query) {
      pollId = setInterval(async () => {
        try {
          const status = await perms.query({ name: "display-capture" as any });
          if (status?.state === "granted" && !submitted) {
            toast.error("Screen sharing detected — contest auto-submitted.");
            submit();
          }
        } catch { /* unsupported */ }
      }, 2500);
    }
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("keydown", keyBlock, true);
      document.body.style.userSelect = prevUserSelect;
      if (pollId) clearInterval(pollId);
    };
  }, [isContest, submitted, contestDone, alreadyAttempted, submit]);


  // Leaving the app/tab for more than 10 seconds during a contest auto-submits.
  useEffect(() => {
    if (!isContest || !isExam || submitted || contestDone || alreadyAttempted || loading) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let warned = false;
    const start = () => {
      if (timer) return;
      if (!warned) {
        warned = true;
        toast.warning("Don't leave the contest — auto-submitting in 10 seconds.");
      }
      timer = setTimeout(() => {
        toast.error("You left the app. Contest auto-submitted.");
        submit();
      }, 10_000);
    };
    const stop = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const onVis = () => {
      if (document.hidden) start();
      else stop();
    };
    window.addEventListener("blur", start);
    window.addEventListener("focus", stop);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      window.removeEventListener("blur", start);
      window.removeEventListener("focus", stop);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isContest, isExam, submitted, contestDone, alreadyAttempted, loading, submit]);


  useEffect(() => {
    paletteRef.current
      ?.querySelector<HTMLButtonElement>(`[data-question-index="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [idx]);

  const q = questions[idx];
  const total = questions.length;
  const progress = total ? ((idx + 1) / total) * 100 : 0;
  const hh = String(Math.floor(secondsLeft / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  // Track "visited" question IDs (NTA CBT palette needs this).
  useEffect(() => {
    if (!q) return;
    setVisited((prev) => (prev.has(q.id) ? prev : new Set(prev).add(q.id)));
  }, [q?.id]);

  // NTA-style status resolver for a question id.
  const cbtStatus = (qid: string): "not_visited" | "not_answered" | "answered" | "marked" | "marked_answered" => {
    const ans = answers[qid] !== undefined;
    const mk = marked.has(qid);
    const vis = visited.has(qid);
    if (mk && ans) return "marked_answered";
    if (mk) return "marked";
    if (ans) return "answered";
    if (vis) return "not_answered";
    return "not_visited";
  };
  const cbtSwatch = (st: ReturnType<typeof cbtStatus>) => {
    switch (st) {
      case "answered": return "bg-emerald-500 text-white border-emerald-600";
      case "not_answered": return "bg-rose-500 text-white border-rose-600";
      case "marked": return "bg-violet-500 text-white border-violet-600";
      case "marked_answered": return "bg-violet-500 text-white border-violet-600 ring-2 ring-emerald-400";
      default: return "bg-card text-foreground border-border";
    }
  };

  const gotoNext = () => setIdx((i) => Math.min(total - 1, i + 1));
  const saveAndNext = () => { gotoNext(); };
  const markForReviewAndNext = () => {
    if (!q) return;
    setMarked((m) => { const n = new Set(m); n.add(q.id); return n; });
    gotoNext();
  };
  const clearResponse = () => {
    if (!q) return;
    setAnswers((a) => { const n = { ...a }; delete n[q.id]; return n; });
    setWrongMarks((w) => { const n = new Set(w); n.delete(q.id); return n; });
  };


  const setAnswer = (i: number) => {
    if (!q) return;
    const next = { ...answers, [q.id]: i };
    setAnswers(next);
    const isCorrectNow = i === q.correct_index;
    // Always update local wrongMarks so the grid color reacts immediately.
    setWrongMarks((w) => {
      const n = new Set(w);
      if (isCorrectNow) n.delete(q.id);
      else n.add(q.id);
      return n;
    });
    if (isQuiz) {
      void persistAnswers(next);
      if (user) {
        setMistakeSaved((m) => {
          const n = new Set(m);
          if (isCorrectNow) n.delete(q.id);
          else n.add(q.id);
          return n;
        });
        if (!isCorrectNow) {
          void setQuizWrongQuestion({
            data: { questionId: q.id, chapterId: q.chapter_id ?? null, add: true },
          });
        } else {
          // Remove from persistent wrong list when corrected.
          void setQuizWrongQuestion({ data: { questionId: q.id, add: false } });
        }
      }
    }
  };
  const toggleBookmark = async () => {
    if (!q) return;
    const willAdd = !bookmarks.has(q.id);
    setBookmarks((b) => {
      const n = new Set(b);
      if (willAdd) n.add(q.id);
      else n.delete(q.id);
      return n;
    });
    if (!user) return;
    try {
      await setQuizBookmark({ data: { questionId: q.id, add: willAdd } });
    } catch {
      toast.error(willAdd ? "Could not save bookmark" : "Could not remove bookmark");
    }
  };

  const toggleMistake = async () => {
    if (!q) return;
    const willAdd = !mistakeSaved.has(q.id);
    setMistakeSaved((m) => {
      const n = new Set(m);
      if (willAdd) n.add(q.id);
      else n.delete(q.id);
      return n;
    });
    if (!user) return;
    try {
      await setQuizWrongQuestion({
        data: { questionId: q.id, chapterId: q.chapter_id ?? null, add: willAdd },
      });
      toast.success(willAdd ? "Added to My Mistakes" : "Removed from My Mistakes");
    } catch {
      toast.error(willAdd ? "Could not add to My Mistakes" : "Could not update My Mistakes");
    }
  };

  if (loading || authLoading)
    return (
      <LoadingScreen variant="quiz" />
    );

  if (!test)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground">Test not found.</p>
          <Button asChild variant="link">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );

  if (alreadyAttempted)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-amber-500/40 bg-gradient-to-br from-amber-500/5 to-transparent shadow-elegant">
          <CardContent className="p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-3 text-xl font-extrabold">You've already attempted this contest</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Each contest can be attempted only once. Wait for the results to be published on the contest page.
              {alreadyAttempted.score !== null && (
                <> Your score: <span className="font-bold text-foreground">{alreadyAttempted.score}</span>.</>
              )}
            </p>
            <div className="mt-5 flex gap-2">
              {alreadyAttempted.contestId ? (
                <Button asChild className="flex-1 bg-gradient-primary">
                  <Link to="/contest/$contestId" params={{ contestId: alreadyAttempted.contestId }}>
                    View contest
                  </Link>
                </Button>
              ) : (
                <Button asChild className="flex-1 bg-gradient-primary">
                  <Link to="/contests">Browse contests</Link>
                </Button>
              )}
              <Button asChild variant="outline" className="flex-1">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  if (contestDone)
    return (
      <Dialog open onOpenChange={() => nav({ to: "/contests" })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-elegant">
              <Trophy className="h-8 w-8" />
            </div>
            <DialogTitle className="text-center text-2xl">🎉 Contest Submitted!</DialogTitle>
            <DialogDescription className="text-center">
              Great job completing <b>{test.title}</b>. Results are awaiting — the leaderboard and prize distribution will appear on the contest page once the live window ends.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 py-2 text-center">
            <div className="rounded-xl border bg-card p-3"><div className="text-xl font-extrabold">{contestDone.score}</div><div className="text-[10px] uppercase text-muted-foreground">Your score</div></div>
            <div className="rounded-xl border bg-card p-3"><div className="text-xl font-extrabold text-emerald-600">{contestDone.correct}</div><div className="text-[10px] uppercase text-muted-foreground">Correct</div></div>
            <div className="rounded-xl border bg-card p-3"><div className="text-xl font-extrabold">{contestDone.attempted}/{questions.length}</div><div className="text-[10px] uppercase text-muted-foreground">Attempted</div></div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-gradient-to-r from-primary to-blue-600" onClick={() => nav({ to: "/contests" })}>
              Back to contests
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

  if (submitted)
    return (
      <ResultsView
        test={test}
        result={submitted}
        questions={questions}
        answers={answers}
        bookmarks={bookmarks}
        subjects={subjects}
        chapters={chapters}
        attemptId={attemptId}
      />

    );

  if (questions.length === 0)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground">This test has no questions yet.</p>
          <Button asChild variant="link">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );

  const isPyq =
    q.is_pyq === true ||
    !!q.year ||
    (q.source || test.source || "").toUpperCase().includes("PYQ");
  const sourceLabel = isPyq
    ? pyqBadge(q.tag, q.year)
    : q.source?.toUpperCase() === "NCERT"
      ? "NCERT"
      : q.source || "NCERT";
  const subjName = q.subject_id ? subjects[q.subject_id] : undefined;
  const chapName = q.chapter_id ? chapters[q.chapter_id] : undefined;

  // ============ NTA-style CBT UI (exact match to screenshots) ============
  if (isCbt) {
    const candidateName =
      user?.fullName ||
      user?.email?.split("@")[0] ||
      "Candidate";
    const subjectLine =
      test.type === "mock"
        ? "Full Syllabus"
        : test.type === "contest"
          ? "Daily Contest"
          : subjName || "Mixed";
    const cbtCounts = {
      not_visited: questions.filter((qq) => cbtStatus(qq.id) === "not_visited").length,
      not_answered: questions.filter((qq) => cbtStatus(qq.id) === "not_answered").length,
      answered: questions.filter((qq) => cbtStatus(qq.id) === "answered").length,
      marked: questions.filter((qq) => cbtStatus(qq.id) === "marked").length,
      marked_answered: questions.filter((qq) => cbtStatus(qq.id) === "marked_answered").length,
    };
    const paletteBg = (st: ReturnType<typeof cbtStatus>) => {
      switch (st) {
        case "answered": return "bg-emerald-500 text-white border-emerald-600";
        case "not_answered": return "bg-orange-500 text-white border-orange-600";
        case "marked": return "bg-blue-500 text-white border-blue-600";
        case "marked_answered": return "bg-blue-500 text-white border-blue-600";
        default: return "bg-slate-200 text-slate-800 border-slate-300";
      }
    };
    return (
      <div className="min-h-screen bg-slate-100 text-slate-900">
        {/* Candidate strip */}
        <div className="border-b border-slate-300 bg-white px-4 py-3 sm:px-8">
          <div className="mx-auto flex w-full max-w-[1700px] items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-500">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                  <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
                </svg>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] sm:text-sm">
                <span className="text-slate-500">Candidate Name</span>
                <span className="font-semibold text-orange-600">: {candidateName}</span>
                <span className="text-slate-500">Exam Name</span>
                <span className="font-semibold text-orange-600">: {test.title}</span>
                <span className="text-slate-500">Subject</span>
                <span className="font-semibold text-orange-600">: {subjectLine}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1700px] px-4 py-3 sm:px-8">
         <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 lg:items-start">
          <div className="min-w-0 space-y-3 lg:col-start-1">
          {/* Question card */}
          <div className="rounded border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 bg-orange-500 px-4 py-2 text-white">
              <div className="text-base font-bold sm:text-lg">Question {idx + 1}:</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold sm:text-sm">Time:</span>
                <span className="rounded bg-white px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-orange-600 sm:text-sm">
                  {hh}:{mm}:{ss}
                </span>
              </div>
            </div>

            <div className="space-y-4 px-4 py-5 sm:px-6">
              <div className="text-[15px] leading-relaxed text-slate-900 sm:text-base">
                <RichText>{q.text}</RichText>
              </div>
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <div key={i} className="flex gap-2 text-[15px] leading-relaxed text-slate-900">
                    <span className="shrink-0 font-semibold">({i + 1})</span>
                    <div className="flex-1"><RichText>{opt}</RichText></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Radio row */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              <div className="grid grid-cols-4 gap-3">
                {q.options.map((_, i) => {
                  const selected = answers[q.id] === i;
                  return (
                    <label key={i} className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800 outline-none focus:outline-none focus-visible:outline-none">
                      <input
                        type="radio"
                        name={`opt-${q.id}`}
                        checked={selected}
                        onChange={() => setAnswer(i)}
                        className="h-4 w-4 accent-orange-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0"
                      />
                      <span>{i + 1} )</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Primary action buttons */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              onClick={saveAndNext}
              className="rounded bg-emerald-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-emerald-600 focus:outline-none sm:text-sm"
            >
              Save &amp; Next
            </button>
            <button
              onClick={clearResponse}
              className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none sm:text-sm"
            >
              Clear
            </button>
            <button
              onClick={() => setSaveSheet(true)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none sm:text-sm",
                (bookmarks.has(q.id) || mistakeSaved.has(q.id)) &&
                  "border-blue-500 bg-blue-50 text-blue-700",
              )}
            >
              <Bookmark className={cn("h-4 w-4", bookmarks.has(q.id) && "fill-current")} />
              Save
            </button>

            <button
              onClick={() => {
                setMarked((m) => { const n = new Set(m); n.add(q.id); return n; });
              }}
              className="rounded bg-amber-400 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-amber-500 focus:outline-none sm:text-sm"
            >
              Save &amp; Mark
            </button>
            <button
              onClick={markForReviewAndNext}
              className="rounded bg-blue-500 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-blue-600 focus:outline-none sm:text-sm"
            >
              Mark &amp; Next
            </button>
          </div>

          {/* Nav + submit */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              disabled={idx === 0}
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none disabled:opacity-50 sm:text-sm"
            >
              &lt;&lt; Back
            </button>
            <button
              disabled={idx >= total - 1}
              onClick={gotoNext}
              className="rounded border border-slate-400 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none disabled:opacity-50 sm:text-sm"
            >
              Next &gt;&gt;
            </button>
            <button
              onClick={() => setConfirmSubmit(true)}
              disabled={submitting}
              className="ml-auto rounded bg-emerald-500 px-6 py-2 text-xs font-bold uppercase tracking-wide text-white shadow hover:bg-emerald-600 focus:outline-none sm:text-sm"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </button>
          </div>
          </div>

          {/* Right sidebar on desktop, below on mobile */}
          <aside className="mt-4 space-y-3 lg:col-start-2 lg:mt-0 lg:sticky lg:top-4 lg:self-start">
          {/* Legend */}
          <div className="rounded border border-dashed border-slate-400 bg-white px-3 py-3">
            <div className="grid grid-cols-2 gap-y-2 text-xs sm:grid-cols-5 sm:text-sm lg:grid-cols-1">
              <CbtLegend count={cbtCounts.not_visited} label="Not Visited" swatch="bg-slate-300 text-slate-800" />
              <CbtLegend count={cbtCounts.not_answered} label="Not Answered" swatch="bg-orange-500 text-white" />
              <CbtLegend count={cbtCounts.answered} label="Answered" swatch="bg-emerald-500 text-white" />
              <CbtLegend count={cbtCounts.marked} label="Marked" swatch="bg-blue-500 text-white" />
              <CbtLegend count={cbtCounts.marked_answered} label="Marked & Ans" swatch="bg-blue-500 text-white" dot />
            </div>
          </div>

          {/* Palette */}
          <div ref={paletteRef} className="rounded border border-slate-300 bg-white p-3">
            <div className="mb-2 hidden text-xs font-bold uppercase tracking-wider text-slate-600 lg:block">Question Palette</div>
            <div className="flex flex-wrap gap-1.5 lg:grid lg:grid-cols-6">
              {questions.map((qq, i) => {
                const st = cbtStatus(qq.id);
                return (
                  <button
                    key={qq.id}
                    data-question-index={i}
                    onClick={() => setIdx(i)}
                    className={cn(
                      "relative flex h-9 w-9 items-center justify-center rounded-sm border text-sm font-bold transition focus:outline-none",
                      paletteBg(st),
                      i === idx && "ring-2 ring-amber-400 ring-offset-1",
                    )}
                  >
                    {i + 1}
                    {st === "marked_answered" && (
                      <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          </aside>

          <div className="mt-4 flex justify-end lg:col-span-2">
            <Link to="/dashboard" className="text-xs font-semibold text-slate-500 hover:text-slate-700">
              Exit test
            </Link>
          </div>
         </div>
        </div>


        {/* Confirm submit dialog */}
        <SaveQuestionSheet
        open={saveSheet}
        onClose={() => setSaveSheet(false)}
        bookmarked={bookmarks.has(q.id)}
        inMistakes={mistakeSaved.has(q.id)}
        onToggleBookmark={() => void toggleBookmark()}
        onToggleMistake={() => void toggleMistake()}
      />

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
              <Flag className="h-5 w-5 text-amber-600" />
              <DialogTitle className="text-lg font-bold">Confirm Submission</DialogTitle>
            </div>
            <div className="space-y-4 p-5">
              <div className="space-y-2 rounded-xl bg-slate-100 p-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold">{questions.length}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Answered</span><span className="font-bold text-emerald-600">{cbtCounts.answered + cbtCounts.marked_answered}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Not Answered</span><span className="font-bold text-orange-600">{cbtCounts.not_answered}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Marked</span><span className="font-bold text-blue-600">{cbtCounts.marked + cbtCounts.marked_answered}</span></div>
              </div>
              <div className="space-y-2">
                <Button variant="secondary" className="h-11 w-full" onClick={() => setConfirmSubmit(false)}>Review Answers</Button>
                <Button className="h-11 w-full bg-emerald-500 hover:bg-emerald-600" onClick={() => { setConfirmSubmit(false); submit(); }} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Test"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {isContest && !submitted && !contestDone && !alreadyAttempted && !hasAckedAntiCheat("contest", testId) && (
          <AntiCheatGate mode="contest" scopeId={testId} onAccept={() => {}} onCancel={() => nav({ to: "/contests" })} />
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-screen flex-col bg-background lg:pr-[340px]")}>



      {isContest && !submitted && !contestDone && !alreadyAttempted && !hasAckedAntiCheat("contest", testId) && (
        <AntiCheatGate
          mode="contest"
          scopeId={testId}
          onAccept={() => { /* unlocks; rules already start enforcing via effects */ }}
          onCancel={() => nav({ to: "/contests" })}
        />
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5 lg:max-w-4xl">
          <div className="min-w-0 flex-1">
            {(() => {
              const sname = (subjName || "").toLowerCase();
              const isBio = sname.includes("bio") || sname.includes("bot") || sname.includes("zoo");
              const isPC = sname.includes("phy") || sname.includes("chem");
              const boxColor = isBio
                ? "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-500/40"
                : isPC
                  ? "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-300 dark:border-blue-500/40"
                  : "bg-secondary text-foreground border-border";
              return (
                <div className="flex items-center gap-1.5">
                  <span className={cn("min-w-0 truncate rounded-md border px-2 py-0.5 text-xs font-bold", boxColor)}>
                    {test.title}
                  </span>
                  <span className="shrink-0 rounded-md border border-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 dark:border-emerald-500/40">
                    +{test.marks_correct}/{test.marks_wrong}
                  </span>
                  {isExam && (
                    <span className="shrink-0 rounded-md border border-rose-300 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-rose-700 dark:text-rose-300 dark:border-rose-500/40">
                      {hh}:{mm}:{ss}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Flag className="h-3 w-3 text-emerald-600" />
              <span className="font-semibold">NEET</span>
              <span className="ml-2">
                Q {idx + 1} / {total}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Sheet>
                <SheetTrigger asChild>
                  <button
                    aria-label="Grid view"
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <LayoutGrid className="h-5 w-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[50vw] sm:w-[50vw]">
                  <SheetHeader>
                    <SheetTitle>Question Grid</SheetTitle>
                  </SheetHeader>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {isCbt ? (
                      <>
                        <Legend swatch="bg-emerald-500" label="Answered" />
                        <Legend swatch="bg-rose-500" label="Not Answered" />
                        <Legend swatch="bg-violet-500" label="Marked" />
                        <Legend swatch="bg-violet-500 ring-2 ring-emerald-400" label="Marked & Answered" />
                        <Legend swatch="bg-card border" label="Not Visited" />
                      </>
                    ) : (
                      <>
                        <Legend swatch="bg-emerald-500/30" label="Attempted" />
                        <Legend swatch="bg-blue-500/30" label="Marked" />
                        <Legend swatch="bg-card border" label="Not Attempted" />
                      </>
                    )}
                  </div>
                  <div className="mt-4 space-y-5">
                    {(() => {
                      const groups: Record<string, { idx: number; q: Question }[]> = {};
                      questions.forEach((qq, i) => {
                        const name = (qq.subject_id ? subjects[qq.subject_id] : "Other") || "Other";
                        (groups[name] ||= []).push({ idx: i, q: qq });
                      });
                      const order = ["Physics", "Chemistry", "Biology"];
                      const sortedKeys = Object.keys(groups).sort((a, b) => {
                        const ia = order.findIndex((o) => a.toLowerCase().includes(o.toLowerCase()));
                        const ib = order.findIndex((o) => b.toLowerCase().includes(o.toLowerCase()));
                        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                      });
                      return sortedKeys.map((name) => {
                        const items = groups[name];
                        const attempted = items.filter((it) => answers[it.q.id] !== undefined).length;
                        return (
                          <div key={name}>
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-sm font-bold">{name}</div>
                              <div className="text-xs text-muted-foreground">{attempted}/{items.length} attempted</div>
                            </div>
                            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                              {items.map(({ idx: i, q: qq }) => {
                                const isAns = answers[qq.id] !== undefined;
                                const isBm = bookmarks.has(qq.id);
                                const cbt = isCbt ? cbtStatus(qq.id) : null;
                                return (
                                  <button
                                    key={qq.id}
                                    onClick={() => setIdx(i)}
                                    className={cn(
                                      "flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold",
                                      cbt
                                        ? cbtSwatch(cbt)
                                        : isAns
                                          ? "bg-emerald-500/20 border-emerald-300"
                                          : isBm
                                            ? "bg-blue-500/15 border-blue-300"
                                            : "bg-card border-border",
                                    )}
                                  >
                                    {i + 1}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </SheetContent>
              </Sheet>
            <Link
              to="/dashboard"
              aria-label="Exit"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </Link>
          </div>
        </div>
        {/* progress bar */}
        <div className="h-1 w-full bg-secondary">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        {/* Question palette (mobile/tablet — desktop uses the right sidebar) */}
        <div className="mx-auto max-w-3xl lg:hidden">

          <div
            ref={paletteRef}
            className="flex snap-x flex-nowrap gap-1.5 overflow-x-auto overflow-y-hidden px-4 py-2 [scrollbar-width:thin]"
          >
            {questions.map((qq, i) => {
              const isAns = answers[qq.id] !== undefined;
              const isBm = bookmarks.has(qq.id);
              const isCorrect = isAns && isChapterPractice && answers[qq.id] === qq.correct_index;
              const isWrong =
                isChapterPractice &&
                (wrongMarks.has(qq.id) ||
                  (isAns && answers[qq.id] !== qq.correct_index));
              const active = i === idx;
              const cbt = isCbt ? cbtStatus(qq.id) : null;
              return (
                <button
                  key={qq.id}
                  data-question-index={i}
                  onClick={() => setIdx(i)}
                  className={cn(
                    "relative flex h-8 w-8 shrink-0 snap-start items-center justify-center rounded-md border text-xs font-semibold transition",
                    active ? "ring-2 ring-primary/40" : "",
                    cbt
                      ? cbtSwatch(cbt)
                      : isWrong
                        ? "bg-rose-500/10 border-rose-300/60"
                        : isCorrect
                          ? "bg-emerald-500/10 border-emerald-300/60"
                          : isBm
                            ? "bg-blue-500/10 border-blue-300"
                            : "bg-card border-border",
                  )}
                  aria-label={`Question ${i + 1}`}
                >
                  <span className="relative">{i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 lg:max-w-4xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
            {idx + 1}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            Type: single
          </span>
          <div className="ml-auto">
            <ReportQuestionButton questionId={q.id} />
          </div>
        </div>

        <div className="text-base leading-relaxed sm:text-lg">
          <RichText>{q.text}</RichText>
        </div>

        <div className="mt-4 space-y-2">
          {q.options.map((opt, i) => {
            const selected = answers[q.id] === i;
            const locked = (isChapterPractice || isQuiz) && answers[q.id] !== undefined;
            const isCorrectOpt = locked && i === q.correct_index;
            const isWrongPick = locked && selected && i !== q.correct_index;
            return (
              <button
                key={i}
                onClick={() => !locked && setAnswer(i)}
                disabled={locked}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border bg-card p-3.5 text-left text-base transition outline-none focus:outline-none focus-visible:outline-none",
                  !locked && "hover:border-primary/50",
                  selected && !locked && "border-primary",
                  isCorrectOpt && "border-emerald-400/60 bg-emerald-500/5",
                  isWrongPick && "border-rose-400/60 bg-rose-500/5",
                  locked && !isCorrectOpt && !isWrongPick && "border-border opacity-90",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                    isCorrectOpt
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : isWrongPick
                        ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                        : "bg-secondary text-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="h-6 w-px bg-border" />
                <span className="flex-1">
                  <RichText>{opt}</RichText>
                </span>
                <span
                  className={cn(
                    "h-5 w-5 shrink-0 rounded-full border-2",
                    isCorrectOpt
                      ? "border-emerald-400/70 bg-emerald-400/40"
                      : isWrongPick
                        ? "border-rose-400/70 bg-rose-400/40"
                        : selected
                          ? "border-primary bg-primary"
                          : "border-border",
                  )}
                />
              </button>
            );
          })}
        </div>

        {(isChapterPractice || isQuiz) && answers[q.id] !== undefined && (
          <div className="mt-6">
            <h3 className="text-lg font-bold">Explanation</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                  diffClass(q.difficulty),
                )}
              >
                {q.difficulty || "medium"}
              </span>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
                {sourceLabel}
              </span>
              {subjName && (() => {
                const s = subjName.toLowerCase();
                const isBio = s.includes("bot") || s.includes("zoo");
                const isPC = s.includes("phy") || s.includes("chem");
                const c = isBio
                  ? "border-emerald-300 bg-emerald-500/15 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
                  : isPC
                    ? "border-blue-300 bg-blue-500/15 text-blue-700 dark:border-blue-500/40 dark:text-blue-300"
                    : "border-border bg-secondary text-muted-foreground";
                return <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", c)}>{subjName}</span>;
              })()}
              {chapName && (() => {
                const s = (subjName || "").toLowerCase();
                const isBio = s.includes("bot") || s.includes("zoo");
                const isPC = s.includes("phy") || s.includes("chem");
                const c = isBio
                  ? "border-emerald-300 bg-emerald-500/15 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
                  : isPC
                    ? "border-blue-300 bg-blue-500/15 text-blue-700 dark:border-blue-500/40 dark:text-blue-300"
                    : "border-border bg-secondary text-muted-foreground";
                return <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", c)}>{chapName}</span>;
              })()}
            </div>
            <div
              className={cn(
                "mt-1 text-xs font-semibold",
                answers[q.id] === q.correct_index
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-rose-700 dark:text-rose-300",
              )}
            >
              {answers[q.id] === q.correct_index ? "Correct" : "Incorrect"} · Answer:{" "}
              {q.correct_index + 1}
            </div>
            {q.explanation ? (
              <div className="mt-3 text-sm leading-relaxed">
                <RichText>{q.explanation}</RichText>
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">No explanation provided.</div>
            )}
          </div>
        )}
      </main>

      {/* Bottom action */}
      <footer className="sticky bottom-0 border-t border-border bg-card">
        {isCbt ? (
          <div className="mx-auto max-w-3xl px-3 py-2.5 lg:max-w-4xl">
            {/* NTA-style palette legend + counts */}
            <div className="mb-2 grid grid-cols-5 gap-1 text-[10px]">
              {([
                ["answered","Answered","bg-emerald-500"],
                ["not_answered","Not Answered","bg-rose-500"],
                ["not_visited","Not Visited","bg-card border"],
                ["marked","Marked","bg-violet-500"],
                ["marked_answered","Marked & Answered","bg-violet-500 ring-2 ring-emerald-400"],
              ] as const).map(([k,label,cls]) => {
                const n = questions.filter((qq) => cbtStatus(qq.id) === k).length;
                return (
                  <div key={k} className="flex items-center gap-1 rounded border border-border bg-secondary/40 px-1 py-1">
                    <span className={cn("inline-block h-3 w-3 shrink-0 rounded-sm", cls)} />
                    <span className="truncate">{label}</span>
                    <span className="ml-auto font-bold tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMarked((m) => { const n = new Set(m); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })}
                className={cn("h-10", marked.has(q.id) && "border-violet-500 bg-violet-500/10 text-violet-700")}
              >
                {marked.has(q.id) ? "Unmark" : "Mark for Review & Next"}
              </Button>
              <Button variant="outline" size="sm" className="h-10" onClick={clearResponse}>
                Clear Response
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveSheet(true)}
                className={cn(
                  "h-10",
                  (bookmarks.has(q.id) || mistakeSaved.has(q.id)) &&
                    "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300",
                )}
              >
                <Bookmark
                  className={cn("mr-1.5 h-4 w-4", bookmarks.has(q.id) && "fill-current")}
                />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10"
                disabled={idx === 0}
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
              >
                Previous
              </Button>
              <div className="ml-auto flex gap-2">
                {idx < total - 1 ? (
                  <Button className="h-10 bg-emerald-600 hover:bg-emerald-700" onClick={saveAndNext}>
                    Save &amp; Next
                  </Button>
                ) : (
                  <Button
                    className="h-10 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => setConfirmSubmit(true)}
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Test"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 lg:max-w-4xl">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSaveSheet(true)}
            className={cn(
              "h-11 w-11 shrink-0",
              bookmarks.has(q.id) && "border-blue-500 bg-blue-500/10 text-blue-600",
            )}
            aria-label="Bookmark for review"
          >
            <Bookmark className={cn("h-5 w-5", bookmarks.has(q.id) && "fill-current")} />
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
          >
            Previous
          </Button>
          {idx < total - 1 ? (
            <Button
              className="h-11 flex-1"
              onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            >
              Next
            </Button>
          ) : isChapterPractice || isQuiz ? (
            <Button className="h-11 flex-1" onClick={() => submit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finish"}
            </Button>
          ) : (
            <Button
              className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setConfirmSubmit(true)}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          )}
        </div>
        )}
      </footer>


      <SaveQuestionSheet
        open={saveSheet}
        onClose={() => setSaveSheet(false)}
        bookmarked={bookmarks.has(q.id)}
        inMistakes={mistakeSaved.has(q.id)}
        onToggleBookmark={() => void toggleBookmark()}
        onToggleMistake={() => void toggleMistake()}
      />

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <div className="bg-amber-50 dark:bg-amber-500/10 px-5 py-4 border-b border-amber-200/60 dark:border-amber-500/20 flex items-center gap-3">
            <Flag className="h-5 w-5 text-amber-600" />
            <DialogTitle className="text-lg font-bold">Confirm Submission</DialogTitle>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-muted/50 p-4 space-y-3">
              <div className="text-center font-semibold">Submission Summary</div>
              {(() => {
                const total = questions.length;
                const answered = Object.keys(answers).length;
                const marked = bookmarks.size;
                const unanswered = total - answered;
                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Total Questions:</span><span className="font-bold">{total}</span></div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Answered:</span><span className="font-bold text-emerald-600">{answered}</span></div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">Unanswered:</span><span className="font-bold text-rose-600">{unanswered}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Marked for Review:</span><span className="font-bold text-amber-600">{marked}</span></div>
                  </div>
                );
              })()}
            </div>
            {(() => {
              const unanswered = questions.length - Object.keys(answers).length;
              if (unanswered > 0) return (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <Flag className="h-4 w-4 shrink-0" /> You have {unanswered} unanswered question{unanswered === 1 ? "" : "s"}
                </div>
              );
              return null;
            })()}
            <p className="text-center text-sm text-muted-foreground">Are you sure you want to submit your {isContest ? "contest" : "test"}?</p>
            <div className="space-y-2">
              <Button variant="secondary" className="w-full h-11" onClick={() => setConfirmSubmit(false)}>Review Answers</Button>
              <Button className="w-full h-11 bg-gradient-primary" onClick={() => { setConfirmSubmit(false); submit(); }} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Submit ${isContest ? "Contest" : "Test"}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {(
        <aside className="fixed right-0 top-0 z-30 hidden h-screen w-[340px] flex-col border-l border-border bg-card lg:flex">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <img src={publicMediaAsset("icons/icon-192.png")} alt="Neet Buddy" className="h-8 w-8 rounded-md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{isCbt ? "Neet Buddy CBT" : "Neet Buddy Quiz"}</div>
              <div className="truncate text-[10px] text-muted-foreground">{test.title}</div>
            </div>
            {isExam && (
              <span className="ml-auto rounded-md border border-rose-300 bg-rose-500/10 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-700 dark:text-rose-300 dark:border-rose-500/40">
                {hh}:{mm}:{ss}
              </span>
            )}
          </div>
          {!isCbt && (
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Progress</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-border px-2 py-1.5">
                  <div className="text-muted-foreground">Attempted</div>
                  <div className="text-base font-bold tabular-nums">{Object.keys(answers).length}/{total}</div>
                </div>
                <div className="rounded border border-border px-2 py-1.5">
                  <div className="text-muted-foreground">Marked</div>
                  <div className="text-base font-bold tabular-nums">{bookmarks.size}</div>
                </div>
              </div>
            </div>
          )}
          {isCbt && (
          <div className="border-b border-border px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Legend</div>
            <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px]">
              {([
                ["answered","Answered","bg-emerald-500"],
                ["not_answered","Not Answered","bg-rose-500"],
                ["not_visited","Not Visited","bg-card border"],
                ["marked","Marked for Review","bg-violet-500"],
                ["marked_answered","Answered & Marked","bg-violet-500 ring-2 ring-emerald-400"],
              ] as const).map(([k,label,cls]) => {
                const n = questions.filter((qq) => cbtStatus(qq.id) === k).length;
                return (
                  <div key={k} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                    <span className={cn("inline-block h-3.5 w-3.5 shrink-0 rounded-sm", cls)} />
                    <span className="flex-1">{label}</span>
                    <span className="font-bold tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Palette</div>
            <div className="grid grid-cols-6 gap-1.5">
              {questions.map((qq, i) => {
                const st = isCbt ? cbtStatus(qq.id) : null;
                const isAns = answers[qq.id] !== undefined;
                const isBm = bookmarks.has(qq.id);
                return (
                  <button
                    key={qq.id}
                    onClick={() => setIdx(i)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold transition",
                      i === idx && "ring-2 ring-primary/60",
                      st
                        ? cbtSwatch(st)
                        : isAns
                          ? "border-emerald-300 bg-emerald-500/20"
                          : isBm
                            ? "border-blue-300 bg-blue-500/15"
                            : "border-border bg-card",
                    )}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-border p-3">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmSubmit(true)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Submit ${isContest ? "Contest" : "Test"}`}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}


function ResultsView({
  test,
  result,
  questions,
  answers,
  bookmarks,
  subjects,
  chapters,
  attemptId,
}: {
  test: Test;
  result: { score: number; correct: number; wrong: number; unattempted: number };
  questions: Question[];
  answers: Record<string, number>;
  bookmarks: Set<string>;
  subjects: Lookup;
  chapters: Lookup;
  attemptId: string | null;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      const rmap = await getAttemptWrongReasons({ data: { attemptId } });
      setReasons(rmap);
    })();
  }, [attemptId]);
  const max = questions.reduce((s, q) => s + q.marks_correct, 0);
  const pct = Math.max(0, Math.round((result.score / Math.max(1, max)) * 100));
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span className="font-bold">Result · {test.title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Card className="overflow-hidden shadow-elegant">
          <div className="bg-gradient-primary p-8 text-center text-primary-foreground">
            <CheckCircle2 className="mx-auto h-10 w-10" />
            <div className="mt-2 text-sm uppercase tracking-widest opacity-90">Your score</div>
            <div className="mt-1 text-5xl font-extrabold">
              {result.score}
              <span className="text-2xl opacity-80"> / {max}</span>
            </div>
            <div className="mt-1 text-sm opacity-90">{pct}%</div>
          </div>
          <CardContent className="grid grid-cols-3 gap-3 p-6">
            <Stat label="Correct" value={result.correct} color="text-emerald-600" />
            <Stat label="Wrong" value={result.wrong} color="text-rose-600" />
            <Stat label="Skipped" value={result.unattempted} color="text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Palette legend */}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Legend swatch="bg-emerald-500/30" label="Correct" />
          <Legend swatch="bg-rose-500/30" label="Wrong" />
          <Legend swatch="bg-blue-500/30" label="Marked for review" />
          <span className="inline-flex items-center gap-1.5">
            <span className="relative inline-block h-3 w-6 overflow-hidden rounded">
              <span className="absolute inset-y-0 left-0 w-1/2 bg-blue-500/40" />
              <span className="absolute inset-y-0 right-0 w-1/2 bg-emerald-500/40" />
            </span>{" "}
            Correct + review
          </span>
        </div>

        {/* Result palette */}
        <div className="mt-3 flex flex-wrap gap-2">
          {questions.map((q, i) => {
            const u = answers[q.id];
            const ok = u === q.correct_index;
            const wrong = u !== undefined && !ok;
            const bm = bookmarks.has(q.id);
            return (
              <span
                key={q.id}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border text-xs font-semibold",
                  "border-border bg-card",
                )}
              >
                {ok && bm && (
                  <>
                    <span className="absolute inset-y-0 left-0 w-1/2 bg-blue-500/30" />
                    <span className="absolute inset-y-0 right-0 w-1/2 bg-emerald-500/40" />
                  </>
                )}
                {ok && !bm && <span className="absolute inset-0 bg-emerald-500/30" />}
                {wrong && <span className="absolute inset-0 bg-rose-500/30" />}
                {u === undefined && bm && <span className="absolute inset-0 bg-blue-500/25" />}
                <span className="relative">{i + 1}</span>
              </span>
            );
          })}
        </div>

        <div className="mt-6">
          <ReasonBreakdown questions={questions} answers={answers} reasons={reasons} hint={attemptId ? "Open Analysis to tag reasons per question." : undefined} />
        </div>

        <h2 className="mt-8 mb-3 text-lg font-bold">Solutions</h2>
        <ResultSolutions questions={questions} answers={answers} subjects={subjects} chapters={chapters} />

        <div className="mt-8 flex justify-center">
          <Button asChild className="bg-gradient-primary">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-6 rounded", swatch)} /> {label}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className={cn("text-2xl font-extrabold", color)}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ResultSolutions({
  questions, answers, subjects, chapters,
}: {
  questions: Question[]; answers: Record<string, number>; subjects: Lookup; chapters: Lookup;
}) {
  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const counts = { all: 0, correct: 0, wrong: 0, skipped: 0 };
  questions.forEach((q) => {
    const u = answers[q.id];
    counts.all++;
    if (u === undefined) counts.skipped++;
    else if (u === q.correct_index) counts.correct++;
    else counts.wrong++;
  });
  const chips: { k: typeof filter; label: string; cls: string }[] = [
    { k: "all", label: `All (${counts.all})`, cls: "border-primary/40 data-[on=true]:bg-primary data-[on=true]:text-primary-foreground" },
    { k: "correct", label: `Correct (${counts.correct})`, cls: "border-emerald-400 data-[on=true]:bg-emerald-500 data-[on=true]:text-white" },
    { k: "wrong", label: `Wrong (${counts.wrong})`, cls: "border-rose-400 data-[on=true]:bg-rose-500 data-[on=true]:text-white" },
    { k: "skipped", label: `Skipped (${counts.skipped})`, cls: "border-border data-[on=true]:bg-foreground data-[on=true]:text-background" },
  ];
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.k}
            data-on={filter === c.k}
            onClick={() => setFilter(c.k)}
            className={cn("rounded-full border bg-background px-3 py-1 text-xs font-semibold transition", c.cls)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const u = answers[q.id];
          const ok = u === q.correct_index;
          const kind: "correct" | "wrong" | "skipped" = u === undefined ? "skipped" : ok ? "correct" : "wrong";
          if (filter !== "all" && filter !== kind) return null;
          const subjName = q.subject_id ? subjects[q.subject_id] : undefined;
          const chapName = q.chapter_id ? chapters[q.chapter_id] : undefined;
          return (
            <Card key={q.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">Q{i + 1}</Badge>
                  <Badge className={cn(ok ? "bg-emerald-600" : u === undefined ? "bg-muted text-muted-foreground" : "bg-rose-600")}>
                    {ok ? "Correct" : u === undefined ? "Skipped" : "Wrong"}
                  </Badge>
                  <span className={cn("rounded-full border px-2.5 py-0.5 font-semibold capitalize", diffClass(q.difficulty))}>{q.difficulty}</span>
                  {subjName && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">{subjName}</span>}
                  {chapName && <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">{chapName}</span>}
                </div>
                <div className="mt-2 text-sm"><RichText>{q.text}</RichText></div>
                <div className="mt-2 grid gap-1.5 text-sm">
                  {q.options.map((o, j) => (
                    <div key={j} className={cn(
                      "rounded-lg border px-3 py-2",
                      j === q.correct_index && "border-emerald-500 bg-emerald-500/10",
                      j === u && j !== q.correct_index && "border-rose-500 bg-rose-500/10",
                    )}>
                      <span className="font-semibold">{String.fromCharCode(65 + j)}.</span> <RichText>{o}</RichText>
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <div className="mt-3 rounded-lg bg-secondary p-3 text-xs">
                    <b>Solution:</b> <RichText>{q.explanation}</RichText>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function CbtLegend({ count, label, swatch, dot }: { count: number; label: string; swatch: string; dot?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("relative flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 text-[11px] font-bold", swatch)}>
        {count}
        {dot && <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
      </span>
      <span className="text-slate-700">{label}</span>
    </div>
  );
}
