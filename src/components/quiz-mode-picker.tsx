// Shared "Quiz vs Test vs Chat mode" chooser shown before starting a DPP/quiz/mock.
// Renders as a bottom sheet on mobile and a dialog on desktop.

import { BookOpen, CheckCircle2, MessageSquare, Timer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export type QuizMode = "quiz" | "test" | "cbt" | "chat";

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
    <div className="grid gap-2.5 py-2">
      <button
        onClick={() => onPick("quiz")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-sm">Quiz mode</div>
          <div className="text-xs text-muted-foreground">
            Instant feedback. See answers & explanations after each question.
          </div>
        </div>
      </button>

      <button
        onClick={() => onPick("test")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-sm">Test mode</div>
          <div className="text-xs text-muted-foreground">
            Same clean quiz UI. Select answers freely; review answers only after submit.
          </div>
        </div>
      </button>

      <button
        onClick={() => onPick("chat")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-sm">Chat mode</div>
          <div className="text-xs text-muted-foreground">
            AI-assisted learning. Solve questions step-by-step with interactive hints.
          </div>
        </div>
      </button>

      <button
        onClick={() => onPick("cbt")}
        disabled={busy}
        className="group flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
          <Timer className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-sm">CBT mode (NTA-like)</div>
          <div className="text-xs text-muted-foreground">
            Timed exam interface with full NTA question palette.
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
