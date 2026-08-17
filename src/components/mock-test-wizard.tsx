import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, ArrowRight, Check, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createMockTest, previewMockSelection } from "@/lib/admin-mock.functions";

type Subject = { id: string; name: string };
type Chapter = { id: string; subject_id: string; name: string; class: number | null };
type Difficulty = "easy" | "medium" | "hard" | "mixed";

export function MockTestWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({}); // subjectId -> chapterIds
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [perSubject, setPerSubject] = useState(45);
  const [duration, setDuration] = useState(180);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ subjectName: string; available: number }[] | null>(null);

  const previewFn = useServerFn(previewMockSelection);
  const createFn = useServerFn(createMockTest);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from("subjects").select("id,name").order("name"),
        supabase.from("chapters").select("id,subject_id,name,class").order("order_index").order("name"),
      ]);
      setSubjects((s ?? []) as Subject[]);
      setChapters((c ?? []) as Chapter[]);
    })();
  }, []);

  const groups = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, ids]) => ids.size > 0)
        .map(([subjectId, ids]) => ({ subjectId, chapterIds: Array.from(ids) })),
    [selected]
  );

  const totalChapters = groups.reduce((n, g) => n + g.chapterIds.length, 0);

  function toggleChapter(subjectId: string, chapterId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[subjectId] ?? []);
      if (set.has(chapterId)) set.delete(chapterId);
      else set.add(chapterId);
      next[subjectId] = set;
      return next;
    });
  }

  function toggleAllForSubject(subjectId: string, all: boolean) {
    setSelected((prev) => {
      const ids = chapters.filter((c) => c.subject_id === subjectId).map((c) => c.id);
      return { ...prev, [subjectId]: new Set(all ? ids : []) };
    });
  }

  async function goToReview() {
    if (!groups.length) return toast.error("Pick at least one chapter");
    setBusy(true);
    try {
      const res = await previewFn({ data: { groups, difficulty, perSubject } });
      setPreview(res.groups.map((g) => ({ subjectName: g.subjectName, available: g.available })));
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally { setBusy(false); }
  }

  async function publish() {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          difficulty,
          duration_min: duration,
          perSubject,
          groups,
        },
      });
      toast.success(`Published "${res.title}" with ${res.total} questions`);
      if (res.warnings?.length) toast.warning(res.warnings.join(" · "));
      // reset
      setStep(1); setSelected({}); setTitle(""); setDescription(""); setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create mock test</CardTitle>
        <CardDescription>
          {step === 1 && "Step 1 of 4 · Pick chapters per subject. Questions are auto-selected from these chapters."}
          {step === 2 && "Step 2 of 4 · Choose difficulty."}
          {step === 3 && "Step 3 of 4 · Title, description, duration."}
          {step === 4 && "Step 4 of 4 · Review & publish."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Stepper step={step} />

        {step === 1 && (
          <div className="space-y-4">
            {subjects.length === 0 && <p className="text-sm text-muted-foreground">Loading subjects…</p>}
            {subjects.map((s) => {
              const subjChs = chapters.filter((c) => c.subject_id === s.id);
              const set = selected[s.id] ?? new Set<string>();
              const allOn = subjChs.length > 0 && subjChs.every((c) => set.has(c.id));
              return (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{s.name}</span>
                      <Badge variant="secondary">{set.size}/{subjChs.length}</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toggleAllForSubject(s.id, !allOn)}>
                      {allOn ? "Clear" : "Select all"}
                    </Button>
                  </div>
                  {subjChs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No chapters under this subject yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subjChs.map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent">
                          <Checkbox checked={set.has(c.id)} onCheckedChange={() => toggleChapter(s.id, c.id)} />
                          <span className="leading-tight">
                            {c.name}
                            {c.class ? <span className="ml-1 text-xs text-muted-foreground">· Cl {c.class}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label>Difficulty</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["easy", "medium", "hard", "mixed"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`rounded-lg border px-3 py-3 text-sm font-medium capitalize transition ${
                    difficulty === d ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <Label>Questions per subject</Label>
                <Input type="number" min={1} max={200} value={perSubject} onChange={(e) => setPerSubject(Number(e.target.value) || 45)} />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="NEET Full Mock #1" /></div>
            <div><Label>Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Full-length pattern test covering selected chapters." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Duration (minutes)</Label><Input type="number" min={10} max={360} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 180)} /></div>
            </div>
          </div>
        )}

        {step === 4 && preview && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Title</div>
              <div className="font-semibold">{title || <em className="text-muted-foreground">Untitled</em>}</div>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Difficulty</div><div className="font-semibold capitalize">{difficulty}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Duration</div><div className="font-semibold">{duration} min</div></div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Question pool per subject</div>
              <div className="space-y-1.5">
                {preview.map((p) => (
                  <div key={p.subjectName} className="flex items-center justify-between text-sm">
                    <span>{p.subjectName}</span>
                    <Badge variant={p.available >= perSubject ? "secondary" : "destructive"}>
                      {Math.min(p.available, perSubject)} / {perSubject} {p.available < perSubject ? `(only ${p.available} available)` : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            disabled={step === 1 || busy}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div className="text-xs text-muted-foreground">
            {step === 1 && `${totalChapters} chapter${totalChapters === 1 ? "" : "s"} selected`}
          </div>
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              disabled={busy || (step === 1 && totalChapters === 0)}
              className="bg-gradient-primary"
            >
              Next <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={goToReview} disabled={busy || !title.trim()} className="bg-gradient-primary">
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Review
            </Button>
          )}
          {step === 4 && (
            <Button onClick={publish} disabled={busy} className="bg-gradient-accent">
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />} Publish
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Chapters", "Difficulty", "Details", "Publish"];
  return (
    <div className="flex items-center gap-2 text-xs">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold ${
                active ? "border-primary bg-primary text-primary-foreground" : done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>{l}</span>
            {i < labels.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
