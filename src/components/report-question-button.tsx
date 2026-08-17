import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportQuestion } from "@/lib/question-reports.functions";

const REASONS = [
  "Wrong correct answer",
  "Factually incorrect",
  "Ambiguous / multiple correct",
  "Duplicate or no correct option",
  "Typo / formatting issue",
  "Out of syllabus",
];

export function ReportQuestionButton({ questionId, size = "sm" }: { questionId: string; size?: "sm" | "icon" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = useServerFn(reportQuestion);

  async function onSubmit() {
    setSubmitting(true);
    try {
      await submit({ data: { question_id: questionId, reason, details: details.trim() || undefined } });
      toast.success("Reported. Our AI reviewer will verify it shortly.");
      setOpen(false);
      setDetails("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg.includes("duplicate") ? "You've already reported this question." : msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
        aria-label="Report this question"
      >
        <Flag className="h-4 w-4" />
        {size === "sm" && <span className="ml-1.5 text-xs">Report</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report this question</DialogTitle>
            <DialogDescription>
              Our AI will review and remove the question if it's confirmed wrong.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <RadioGroup value={reason} onValueChange={setReason} className="space-y-1.5">
              {REASONS.map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`r-${r}`} />
                  <Label htmlFor={`r-${r}`} className="text-sm font-normal">{r}</Label>
                </div>
              ))}
            </RadioGroup>
            <Textarea
              placeholder="Optional details (what's wrong, suggested fix)…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
