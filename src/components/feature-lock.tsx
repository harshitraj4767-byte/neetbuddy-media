import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/use-access";
import { FEATURE_LABEL_MAP } from "@/lib/feature-labels";

type Props = {
  feature: string;
  children: ReactNode;
  title?: string;
};

export function FeatureLock({ feature, children, title }: Props) {
  const { hasFeature, isLoading, isSignedIn, trialActive, subscriptionActive } = useAccess();

  if (!isSignedIn) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (hasFeature(feature)) return <>{children}</>;

  const label = title ?? FEATURE_LABEL_MAP[feature] ?? feature;
  const reason = trialActive
    ? "This feature isn't included in your trial."
    : subscriptionActive
    ? "Your current batch doesn't include this feature."
    : "Your trial has ended. Purchase a batch to keep learning.";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card className="border-0 shadow-elegant">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-blue-500/10 p-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">Upgrade required</div>
            <h1 className="text-xl font-bold tracking-tight">{label} is locked</h1>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">{reason}</p>
          </div>
          <Button asChild size="lg" className="bg-gradient-primary shadow-elegant hover:opacity-95">
            <Link to="/premium">
              <Sparkles className="mr-2 h-4 w-4" /> Unlock with a batch
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
