import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,avatar_url,wallet_balance,deposit_balance,winnings_balance,bonus_balance,xp_total,daily_goal,target_year").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(prof as Profile | null);
    setIsAdmin(!!roles?.some((r: { role: string }) => r.role === "admin"));
  };

  useEffect(() => {
    const tryApplyPendingRef = async (userId: string) => {
      if (typeof window === "undefined") return;
      let pending: string | null = null;
      try { pending = localStorage.getItem("pending_ref_code"); } catch { /* noop */ }
      if (!pending) return;
      try {
        const { applyReferralCode } = await import("@/lib/referrals.functions");
        await applyReferralCode({ data: { code: pending } });
      } catch (e) {
        // Already used / invalid / self → just clear so we don't retry forever.
        console.warn("[auth] pending referral apply failed", e);
      } finally {
        try { localStorage.removeItem("pending_ref_code"); } catch { /* noop */ }
        // Reload profile so the new bonus_balance shows up.
        loadProfile(userId).catch(() => {});
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
        if (event === "SIGNED_IN") {
          setTimeout(() => tryApplyPendingRef(s.user.id), 200);
        }
      } else {
        setProfile(null); setIsAdmin(false);
      }
    });
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (s?.user) {
          loadProfile(s.user.id).finally(() => setLoading(false));
          // Also try at initial mount in case SIGNED_IN fired before listener attached.
          tryApplyPendingRef(s.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("[auth] failed to restore session", error);
        setSession(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      });
    return () => subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    profile,
    isAdmin,
    loading,
    signOut: async () => { await supabase.auth.signOut(); },
    refresh: async () => { if (session?.user) await loadProfile(session.user.id); },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
