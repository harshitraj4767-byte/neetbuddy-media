import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentSession, signOut as signOutFn } from "@/lib/auth-mysql.functions";

export type AuthUser = { id: string; email: string | null; fullName: string | null };

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  wallet_balance: number;
  deposit_balance: number;
  winnings_balance: number;
  bonus_balance: number;
  xp_total: number;
  daily_goal: number;
  target_year: number | null;
};

type AuthCtx = {
  user: AuthUser | null;
  session: { user: AuthUser } | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getCurrentSession();
      setUser(s.user ? { id: s.user.id, email: s.user.email, fullName: s.user.fullName } : null);
      setProfile((s.profile as Profile | null) ?? null);
      setIsAdmin(s.isAdmin);
    } catch (error) {
      console.error("[auth] failed to restore session", error);
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apply a referral code captured before signup, once a user exists.
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    let pending: string | null = null;
    try { pending = localStorage.getItem("pending_ref_code"); } catch { /* noop */ }
    if (!pending) return;
    (async () => {
      try {
        const { applyReferralCode } = await import("@/lib/referrals.functions");
        await applyReferralCode({ data: { code: pending! } });
      } catch (e) {
        console.warn("[auth] pending referral apply failed", e);
      } finally {
        try { localStorage.removeItem("pending_ref_code"); } catch { /* noop */ }
        void refresh();
      }
    })();
  }, [user, refresh]);

  const value: AuthCtx = {
    user,
    session: user ? { user } : null,
    profile,
    isAdmin,
    loading,
    signOut: async () => {
      await signOutFn();
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
    },
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
