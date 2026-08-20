import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Play, Trash2, MoreVertical, ChevronLeft, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SafeRichText as RichText } from "@/components/safe-rich-text";
import { QuizModePicker, type QuizMode } from "@/components/quiz-mode-picker";
import { createBookmarkTest } from "@/lib/trial-limits.functions";
import { attachQuestionMedia } from "@/lib/question-media";


export const Route = createFileRoute("/bookmarks")({
  head: () => ({ meta: [{ title: "My Bookmarks — Neet Buddy" }] }),
  component: BookmarksPage,
});

type Q = { id: string; text: string; options: string[]; difficulty: string; subject_id: string | null; chapter_id: string | null };
type Lookup = Record<string, string>;

function BookmarksPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Q[] | null>(null);
  const [subjects, setSubjects] = useState<Lookup>({});
  const [chapters, setChapters] = useState<Lookup>({});
  const [subjFilter, setSubjFilter] = useState<string>("all");
  const [launching, setLaunching] = useState(false);
  const [pickMode, setPickMode] = useState(false);


  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  const load = async () => {
    if (!user) return;
    setItems(null);
    const { data: bm } = await supabase.from("bookmarks").select("question_id").eq("user_id", user.id).order("created_at", { ascending: false });
    const ids = (bm ?? []).map((b) => b.question_id);
    if (!ids.length) { setItems([]); setSubjects({}); setChapters({}); return; }
    const { data: qs } = await supabase.from("questions").select("id,text,options,difficulty,subject_id,chapter_id").in("id", ids);
    // preserve bookmark order
    const ordered = (ids.map((id) => qs?.find((q) => q.id === id)).filter(Boolean) as Q[]).map((q) => attachQuestionMedia(q));
    setItems(ordered);

    const sIds = Array.from(new Set(ordered.map((q) => q.subject_id).filter(Boolean))) as string[];
    const cIds = Array.from(new Set(ordered.map((q) => q.chapter_id).filter(Boolean))) as string[];
    const [{ data: s }, { data: c }] = await Promise.all([
      sIds.length ? supabase.from("subjects").select("id,name").in("id", sIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      cIds.length ? supabase.from("chapters").select("id,name").in("id", cIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    setSubjects(Object.fromEntries((s ?? []).map((x) => [x.id, x.name])));
    setChapters(Object.fromEntries((c ?? []).map((x) => [x.id, x.name])));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (subjFilter === "all") return items;
    return items.filter((q) => q.subject_id === subjFilter);
  }, [items, subjFilter]);

  const removeOne = async (qid: string) => {
    if (!user) return;
    await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("question_id", qid);
    setItems((it) => (it ?? []).filter((q) => q.id !== qid));
    toast.success("Bookmark removed");
  };

  const createBmTest = useServerFn(createBookmarkTest);
  const practice = async (mode: QuizMode) => {
    if (!user || !filtered?.length) return;
    setLaunching(true);
    const ids = filtered.map((q) => q.id);
    try {
      const r = await createBmTest({ data: { question_ids: ids, title: "My Bookmarks" } });
      setLaunching(false);
      setPickMode(false);
      nav({ to: "/quiz/$testId", params: { testId: r.testId }, search: { mode } });
    } catch (e) {
      setLaunching(false);
      toast.error(e instanceof Error ? e.message : "Could not start");
    }
  };


  return (
    <PageShell>
      <div className="-mt-2 mb-4 flex items-center justify-between">
        <button onClick={() => history.back()} className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary">
          <ChevronLeft className="h-5 w-5" /> My Bookmarks
        </button>
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={subjFilter} onValueChange={setSubjFilter}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] rounded-full border-border bg-card text-sm"><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {Object.entries(subjects).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered && filtered.length > 0 && (
          <Button size="sm" onClick={() => setPickMode(true)} disabled={launching} className="ml-auto h-9 rounded-full bg-gradient-primary">
            {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="mr-1.5 h-4 w-4" /> Practice ({filtered.length})</>}
          </Button>
        )}

      </div>

      {items === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (filtered?.length ?? 0) === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No bookmarks yet. Tap the bookmark icon during a quiz to save a question for review.</CardContent></Card>
      ) : (
        <>
          <div className="mb-3 text-xs font-medium text-muted-foreground">{filtered!.length}+ Bookmarks found</div>
          <div className="space-y-3">
            {filtered!.map((q, i) => {
              const subj = q.subject_id ? subjects[q.subject_id] : "";
              const chap = q.chapter_id ? chapters[q.chapter_id] : "";
              return (
                <Card key={q.id} className="overflow-hidden border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-primary/5 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-semibold text-foreground">{i + 1}</span>
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                      </div>
                      <div className="min-w-0">
                        {subj && <div className="text-sm font-semibold text-foreground">{subj}</div>}
                        {chap && <div className="truncate text-xs text-muted-foreground">{chap}</div>}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => removeOne(q.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete bookmark
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardContent className="p-4">
                    <div className="text-sm leading-relaxed"><RichText>{q.text}</RichText></div>
                    {q.options?.length > 0 && (
                      <div className="mt-3 space-y-1.5 text-sm">
                        {q.options.map((o, j) => (
                          <div key={j} className="text-foreground/90">
                            <span className="font-semibold">({String.fromCharCode(65 + j)})</span> <RichText>{o}</RichText>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
      <QuizModePicker
        open={pickMode}
        busy={launching}
        subtitle={`Practice ${filtered?.length ?? 0} bookmarked questions.`}
        onClose={() => setPickMode(false)}
        onPick={practice}
      />
    </PageShell>

  );
}
