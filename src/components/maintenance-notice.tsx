import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";

// Scheduled maintenance window ends on 20 Aug (end of day, IST ≈ UTC+5:30).
const MAINTENANCE_END = new Date("2026-08-20T18:30:00Z");
const KEY = "nb-maintenance-notice-20aug";

export function MaintenanceNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (Date.now() > MAINTENANCE_END.getTime()) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(KEY) === today) return;
    } catch { /* storage blocked — still show */ }
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { localStorage.setItem(KEY, new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant">
            <Wrench className="h-6 w-6" />
          </div>
          <DialogTitle className="mt-3 text-center">Scheduled maintenance</DialogTitle>
          <DialogDescription className="text-center">
            The app is under scheduled maintenance for the next 2 days. A few features may not work
            properly until <span className="font-semibold text-foreground">20th August</span>. Sorry for
            the inconvenience — your data is safe.
          </DialogDescription>
        </DialogHeader>
        <Button onClick={dismiss} className="w-full bg-gradient-primary">Got it</Button>
      </DialogContent>
    </Dialog>
  );
}
