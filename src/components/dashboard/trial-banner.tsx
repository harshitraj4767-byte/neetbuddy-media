import { Link } from "@tanstack/react-router";
import { Clock, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/use-access";

function daysHoursLeft(iso: string | null): { d: number; h: number; totalH: number } {
  if (!iso) return { d: 0, h: 0, totalH: 0 };
  const ms = new Date(iso).getTime() - Date.now();
  const totalH = Math.max(0, Math.ceil(ms / 3_600_000));
  return { d: Math.floor(totalH / 24), h: totalH % 24, totalH };
}

export function TrialBanner() {
  const { isSignedIn, isLoading, subscriptionActive, trialActive, trialExpiresAt, access } = useAccess();
  if (!isSignedIn || isLoading || subscriptionActive || access.isAdmin) return null;

  if (trialActive) {
    const { d, h, totalH } = daysHoursLeft(trialExpiresAt);
    const label = d > 0 ? `${d}d ${h}h left` : `${totalH}h left`;
    return (
      <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-400/15 via-amber-300/10 to-orange-400/10 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 text-sm">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0">
              <div className="truncate font-semibold">3-Day Free Trial — {label}</div>
              <div className="text-xs text-muted-foreground">
                You have full access to the <span className="font-medium text-foreground">Prime batch</span> features during your trial. Upgrade any time to keep learning after it ends.
              </div>
            </div>
          </div>
          <Button asChild size="sm" className="bg-gradient-primary shadow-elegant sm:shrink-0">
            <Link to="/premium"><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Upgrade now</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Trial ended / no subscription
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="truncate font-semibold">Trial ended</div>
            <div className="text-xs text-muted-foreground">Purchase a batch to continue using Neet Buddy.</div>
          </div>
        </div>
        <Button asChild size="sm" className="bg-gradient-primary shadow-elegant sm:shrink-0">
          <Link to="/premium"><Sparkles className="mr-1.5 h-3.5 w-3.5" /> View batches</Link>
        </Button>
      </div>
    </div>
  );
}
