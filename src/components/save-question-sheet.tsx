// Bottom-sheet (mobile) / dialog (desktop) shown from the quiz toolbar so a
// student can quickly save the current question to Bookmarks or My Mistakes.

import { Bookmark, BookmarkCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function SaveQuestionSheet({
  open,
  onClose,
  bookmarked,
  inMistakes,
  onToggleBookmark,
  onToggleMistake,
}: {
  open: boolean;
  onClose: () => void;
  bookmarked: boolean;
  inMistakes: boolean;
  onToggleBookmark: () => void;
  onToggleMistake: () => void;
}) {
  const isMobile = useIsMobile();

  const rows = [
    {
      key: "bm",
      active: bookmarked,
      icon: bookmarked ? BookmarkCheck : Bookmark,
      tone: "text-blue-600 bg-blue-500/15",
      activeCls: "border-blue-500 bg-blue-500/5",
      title: bookmarked ? "Remove bookmark" : "Bookmark this question",
      sub: bookmarked
        ? "It will no longer appear in My Bookmarks."
        : "Save it to My Bookmarks and practice all bookmarks later.",
      onClick: onToggleBookmark,
    },
    {
      key: "mk",
      active: inMistakes,
      icon: inMistakes ? CheckCircle2 : AlertTriangle,
      tone: "text-rose-600 bg-rose-500/15",
      activeCls: "border-rose-500 bg-rose-500/5",
      title: inMistakes ? "Remove from My Mistakes" : "Add to My Mistakes",
      sub: inMistakes
        ? "Marked as learnt — it drops out of your mistakes list."
        : "Keep it in My Mistakes so you can retest these questions.",
      onClick: onToggleMistake,
    },
  ];

  const body = (
    <div className="grid gap-3 py-2">
      {rows.map((r) => (
        <button
          key={r.key}
          onClick={() => {
            r.onClick();
            onClose();
          }}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5",
            r.active && r.activeCls,
          )}
        >
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", r.tone)}>
            <r.icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">{r.title}</div>
            <div className="text-xs text-muted-foreground">{r.sub}</div>
          </div>
        </button>
      ))}
    </div>
  );

  const title = "Save this question";
  const subtitle = "Add it to your revision lists and build a test out of them later.";

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
