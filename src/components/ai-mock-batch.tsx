import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { generateAiMockBatch } from "@/lib/admin-mock.functions";
import { listMockCategories } from "@/lib/mock-categories.functions";

type Difficulty = "easy" | "medium" | "hard" | "mixed";

export function AiMockBatch() {
  const [count, setCount] = useState(3);
  const perMock = 180;
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [duration, setDuration] = useState(180);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [categories, setCategories] = useState<Array<{ id: string; name: string; active: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Array<{ id: string; title: string; total: number; level: string }> | null>(null);

  const run = useServerFn(generateAiMockBatch);
  const loadCats = useServerFn(listMockCategories);
  useEffect(() => { loadCats().then((c) => setCategories((c as any[]).filter((x) => x.active))).catch(() => {}); }, [loadCats]);

  const onGenerate = async () => {
    setBusy(true); setCreated(null);
    try {
      const r = await run({ data: {
        count, perMock, difficulty, duration_min: duration,
        category_id: categoryId === "none" ? null : categoryId,
      } });
      setCreated(r.created);
      toast.success(`Generated ${r.created.length} mocks`);
    } catch (e: any) {
      toast.error(e?.message ?? "Generation failed");
    } finally { setBusy(false); }
  };

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Mock Generator
        </CardTitle>
        <CardDescription>
          Every generated mock has exactly <span className="font-semibold">180 questions</span>, balanced across your subject pool.
          Pick a category so the mocks appear under the correct chip on the Mocks page.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Number of mocks</Label>
          <Input type="number" min={1} max={20} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, +e.target.value || 1)))} />
        </div>
        <div className="space-y-1.5">
          <Label>Questions per mock</Label>
          <Input type="number" value={180} disabled />
        </div>
        <div className="space-y-1.5">
          <Label>Difficulty pool</Label>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mixed">Mixed</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Duration (min)</Label>
          <Input type="number" min={10} max={360} value={duration}
            onChange={(e) => setDuration(Math.max(10, Math.min(360, +e.target.value || 10)))} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Category (filter chip)</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Uncategorized</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Total questions needed: <span className="font-semibold text-foreground">{count * perMock}</span>.
            DB must have at least that many in the selected difficulty pool.
          </p>
          <Button onClick={onGenerate} disabled={busy} className="bg-gradient-primary">
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Generate {count} mock{count > 1 ? "s" : ""}
          </Button>
        </div>

        {created && created.length > 0 && (
          <div className="sm:col-span-4 rounded-lg border bg-secondary/40 p-3">
            <div className="mb-2 text-sm font-bold">Created</div>
            <ul className="space-y-1.5">
              {created.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 flex-none text-emerald-600" />
                    <span className="truncate">{c.title}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{c.total} qs · {c.level}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
