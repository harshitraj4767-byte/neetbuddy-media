import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, ChevronLeft, Trash2, ShieldCheck, EyeOff, Scan } from "lucide-react";
import {
  scanQuestionsForSyllabus,
  listQuestionFlags,
  resolveQuestionFlag,
  attachQuestionDiagram,
} from "@/lib/admin-question-scan.functions";

export const Route = createFileRoute("/admin/question-scan")({
  head: () => ({ meta: [{ title: "Admin · Question Scan — Neet Buddy" }] }),
  component: QuestionScan,
});

type FlagRow = {
  id: string;
  question_id: string;
  reason: string;
  severity: string;
  detail: string | null;
  status: string;
  questions?: {
    text: string;
    options: string[];
    correct_index: number;
    chapters?: { name?: string } | null;
    subjects?: { name?: string } | null;
  } | null;
};

function QuestionScan() {
  const scanFn = useServerFn(scanQuestionsForSyllabus);
  const listFn = useServerFn(listQuestionFlags);
  const resolveFn = useServerFn(resolveQuestionFlag);
  const attachFn = useServerFn(attachQuestionDiagram);

  const [rows, setRows] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [limit, setLimit] = useState(50);

  async function refresh() {
    setLoading(true);
    try {
      const out = await listFn({ data: { status: "open", limit: 100 } });
      const parsed = JSON.parse(out.rowsJson) as FlagRow[];
      setRows(parsed);
    } catch (e) { toast.error(e instanceof Error ? e.message : "load failed"); }
    finally { setLoading(false); }
  }

  async function runScan() {
    setScanning(true);
    try {
      const out = await scanFn({ data: { subjectId: subjectId || undefined, chapterId: chapterId || undefined, limit } });
      toast.success(`Scanned ${out.scanned}, flagged ${out.flagged}`);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "scan failed"); }
    finally { setScanning(false); }
  }

  async function resolve(id: string, action: "delete"|"approve_keep"|"ignore") {
    try {
      await resolveFn({ data: { flagId: id, action } });
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) { toast.error(e instanceof Error ? e.message : "resolve failed"); }
  }

  async function attach(questionId: string) {
    const url = window.prompt("Diagram image URL (leave blank to skip):", "") ?? "";
    const prompt = window.prompt("Image prompt for AI regenerate (optional):", "") ?? "";
    if (!url && !prompt) return;
    try {
      await attachFn({ data: { questionId, diagramUrl: url || undefined, imagePrompt: prompt || undefined } });
      toast.success("Diagram attached");
    } catch (e) { toast.error(e instanceof Error ? e.message : "attach failed"); }
  }

  return (
    <PageShell>
      <div className="mb-4 flex items-center gap-2">
        <Link to="/admin"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1"/>Back</Button></Link>
        <h1 className="text-2xl font-bold">Question Scan · Admin</h1>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-lg">Run AI syllabus scan</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Subject UUID (optional)" value={subjectId} onChange={(e)=>setSubjectId(e.target.value)} />
          <Input placeholder="Chapter UUID (optional)" value={chapterId} onChange={(e)=>setChapterId(e.target.value)} />
          <Input type="number" min={1} max={200} value={limit} onChange={(e)=>setLimit(Number(e.target.value)||50)} />
          <div className="flex gap-2">
            <Button onClick={runScan} disabled={scanning} className="flex-1">
              {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Scan className="h-4 w-4 mr-1"/>}
              Scan
            </Button>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No open flags. Run a scan to find out-of-syllabus / irrelevant questions.</p>
        )}
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">{r.reason}</Badge>
                <Badge variant="outline">{r.severity}</Badge>
                {r.questions?.subjects?.name && <Badge variant="secondary">{r.questions.subjects.name}</Badge>}
                {r.questions?.chapters?.name && <Badge variant="secondary">{r.questions.chapters.name}</Badge>}
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.questions?.text}</p>
              <ol className="text-xs text-muted-foreground list-decimal ml-5">
                {(r.questions?.options ?? []).map((o, i) => (
                  <li key={i} className={i === r.questions?.correct_index ? "font-semibold text-foreground" : ""}>{o}</li>
                ))}
              </ol>
              {r.detail && <p className="text-xs italic text-muted-foreground">AI: {r.detail}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="destructive" onClick={() => resolve(r.id, "delete")}><Trash2 className="h-3 w-3 mr-1"/>Delete question</Button>
                <Button size="sm" variant="outline" onClick={() => resolve(r.id, "approve_keep")}><ShieldCheck className="h-3 w-3 mr-1"/>Keep</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(r.id, "ignore")}><EyeOff className="h-3 w-3 mr-1"/>Ignore</Button>
                <Button size="sm" variant="secondary" onClick={() => attach(r.question_id)}>+ Attach diagram</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
