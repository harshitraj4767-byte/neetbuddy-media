import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sparkles, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAccess } from "@/hooks/use-access";

// Routes signed-in users without any entitlement (no trial, no subscription)
// are still allowed to visit. Daily DPP, contests and battlegrounds are
// permanently free for everyone.
const ALLOWED_PREFIXES = [
  "/premium",
  "/subscription",
  "/login",
  "/auth",
  "/admin",
  "/privacy",
  "/profile",
  "/feedback",
  "/support",
  "/batches",
  // Always-free features
  "/dpp",
  "/daily",
  "/contest",
  "/contests",
  "/battleground",
  "/battlegrounds",
  "/battle",
  "/leaderboard",
  "/quiz",
  "/analysis",
];

function isAllowed(pathname: string) {
  if (pathname === "/") return true;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Global paywall. Signed-in users must hold either an active trial or an
 * active subscription for premium routes. When they don't, we show a bottom
 * sheet explaining the trial has ended with a link to /premium instead of a
 * silent redirect that looks like "nothing is working".
 */
export function PremiumGate() {
  const { isSignedIn, isLoading, access, trialActive, subscriptionActive } = useAccess();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  // Remember which blocked path we already showed the sheet for, so dismissing
  // it ("Not now") never re-opens it on the same page.
  const shownFor = useRef<string | null>(null);

  const blocked =
    !isLoading &&
    isSignedIn &&
    !access.isAdmin &&
    !trialActive &&
    !subscriptionActive &&
    !isAllowed(pathname);

  useEffect(() => {
    if (!blocked) {
      shownFor.current = null;
      setOpen(false);
      return;
    }
    if (shownFor.current !== pathname) {
      shownFor.current = pathname;
      setOpen(true);
    }
  }, [blocked, pathname]);

  const dismiss = () => {
    setOpen(false);
    nav({ to: "/", replace: true });
  };

  if (!blocked || !open) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >

      <SheetContent side="bottom" className="rounded-t-3xl border-t px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <SheetTitle>Your free trial has ended</SheetTitle>
          <SheetDescription>
            This feature needs an active batch. Daily DPP, Daily Live Quiz and Battlegrounds stay free
            forever — everything else unlocks with a batch.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild size="lg" className="bg-gradient-primary shadow-elegant">
            <Link to="/premium" onClick={() => setOpen(false)}>
              <Sparkles className="mr-2 h-4 w-4" /> View batches &amp; upgrade
            </Link>
          </Button>
          <Button variant="ghost" size="lg" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
