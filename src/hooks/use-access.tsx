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

// On static hosting (Hostinger) the TanStack server function cannot answer at
// all, so the PHP endpoint in public/api/access.php is the primary source and
// the server function is only a fallback. Neither call may hang or throw, or
// gated pages would stay on their loading skeleton forever.
const ACCESS_TIMEOUT_MS = 8000;

async function fetchAccessPhp(): Promise<MyAccess | null> {
  try {
    const res = await fetch("/api/access.php", {
      credentials: "include",
      signal: AbortSignal.timeout(ACCESS_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MyAccess> | null;
    if (!data || !Array.isArray(data.features)) return null;
    return { ...EMPTY, ...data } as MyAccess;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("access check timed out")), ACCESS_TIMEOUT_MS),
    ),
  ]);
}

export function useAccess() {
  const { user, loading: authLoading } = useAuth();
  const fetchAccess = useServerFn(getMyAccess);
  const q = useQuery({
    queryKey: ["access", user?.id ?? "anon"],
    queryFn: async (): Promise<MyAccess> => {
      const php = await fetchAccessPhp();
      if (php) return php;
      try {
        return await withTimeout(fetchAccess());
      } catch {
        return EMPTY;
      }
    },
    retry: false,
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
