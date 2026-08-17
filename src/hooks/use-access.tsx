import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type MyAccess } from "@/lib/access.functions";
import { useAuth } from "@/hooks/use-auth";

const EMPTY: MyAccess = {
  tier: "none",
  isAdmin: false,
  isMentor: false,
  trialActive: false,
  trialExpiresAt: null,
  subscriptionActive: false,
  subscriptionExpiresAt: null,
  batchId: null,
  batchTitle: null,
  features: [],
};

export function useAccess() {
  const { user, loading: authLoading } = useAuth();
  const fetchAccess = useServerFn(getMyAccess);
  const q = useQuery({
    queryKey: ["access", user?.id ?? "anon"],
    queryFn: () => fetchAccess(),
    enabled: !!user && !authLoading,
    staleTime: 30_000,
  });
  const access: MyAccess = q.data ?? EMPTY;
  const hasFeature = (key: string): boolean => {
    if (access.isAdmin) return true;
    return access.features.includes(key);
  };
  return {
    access,
    isLoading: authLoading || (!!user && q.isLoading),
    isSignedIn: !!user,
    hasFeature,
    tier: access.tier,
    trialActive: access.trialActive,
    trialExpiresAt: access.trialExpiresAt,
    subscriptionActive: access.subscriptionActive,
    refetch: q.refetch,
  };
}
