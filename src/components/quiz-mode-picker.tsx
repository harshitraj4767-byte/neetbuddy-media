// Shared "Quiz mode vs CBT mode" chooser shown before starting a DPP/quiz.
// Renders as a bottom sheet on mobile and a dialog on desktop.

import { BookOpen, Timer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export type QuizMode = "quiz" | "cbt";

export function QuizModePicker({
  open,
  subtitle,
  onClose,
  onPick,
  busy,
}: {
  open: boolean;
  subtitle?: string;
  onClose: () => void;
  onPick: (mode: QuizMode) => void;
  busy?: boolean;
}) {
  const isMobile = useIsMobile();
  const title = "Choose your mode";

  const body = (
    <div className="grid gap-3 py-2">
      <button
        onClick={() => onPick("quiz")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold">Quiz mode</div>
          <div className="text-xs text-muted-foreground">
            See explanations after each question. Learn as you go.
          </div>
        </div>
      </button>
      <button
        onClick={() => onPick("cbt")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <Timer className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold">CBT mode (NTA-like)</div>
          <div className="text-xs text-muted-foreground">
            Timed, exam-style. Review answers only after submitting.
          </div>
        </div>
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{subtitle}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
