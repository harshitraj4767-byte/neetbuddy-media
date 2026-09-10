// Single entry point for auth used by the UI.
//
// - On Lovable / any Node-or-Worker deployment: uses the TanStack server functions.
// - On static hosting (Hostinger), set VITE_AUTH_API_BASE (e.g. "/api/auth") at
//   build time and the same calls go to the PHP endpoints in public/api/auth.
//
// Both paths return the SAME shape, so call sites never branch:
//   { ok: true, session } | { ok: false, error }

import {
  signInWithPassword as signInServerFn,
  signUpWithPassword as signUpServerFn,
  getCurrentSession as getSessionServerFn,
  signOut as signOutServerFn,
} from "@/lib/auth-mysql.functions";

export type AuthUserDTO = { id: string; email: string | null; fullName: string | null };
export type ProfileDTO = Record<string, string | number | boolean | null>;
export type SessionDTO = {
  user: AuthUserDTO | null;
  profile: ProfileDTO | null;
  isAdmin: boolean;
};

export type AuthResult = { ok: true; session: SessionDTO } | { ok: false; error: string };

export const EMPTY_SESSION: SessionDTO = { user: null, profile: null, isAdmin: false };

const PHP_BASE = (
  (import.meta.env as Record<string, string | undefined>)["VITE_AUTH_API_BASE"] ?? ""
).replace(/\/+$/, "");

export const usesPhpAuthApi = PHP_BASE !== "";

async function php(path: string, body?: unknown): Promise<AuthResult> {
  try {
    const response = await fetch(`${PHP_BASE}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || payload == null) {
      const message = (payload as { error?: string } | null)?.error;
      return { ok: false, error: message ?? `Request failed (${response.status})` };
    }
    return normalize(payload, "Log in failed");
  } catch {
    return { ok: false, error: "Network error. Please check your connection and try again." };
  }
}

// Accepts every shape the different backends have returned over time:
//   { ok:false, error }            → error
//   { ok:true, session:{...} }     → session
//   { user, profile, isAdmin }     → flat session (PHP endpoints)
//   { session:{ user:... } }       → nested session
// Anything else becomes a readable error instead of a TypeError such as
// "Cannot read properties of undefined (reading 'user')".
function normalize(result: unknown, fallbackError: string): AuthResult {
  if (result == null || typeof result !== "object") return { ok: false, error: fallbackError };
  const raw = result as Record<string, unknown>;

  if (raw["ok"] === false || typeof raw["error"] === "string") {
    return { ok: false, error: (raw["error"] as string) ?? fallbackError };
  }

  const source = (
    raw["session"] && typeof raw["session"] === "object"
      ? (raw["session"] as Record<string, unknown>)
      : raw
  ) as Record<string, unknown>;

  const user = source["user"];
  if (user == null || typeof user !== "object") return { ok: false, error: fallbackError };
  const u = user as Record<string, unknown>;
  if (typeof u["id"] !== "string" && typeof u["id"] !== "number") {
    return { ok: false, error: fallbackError };
  }

  return {
    ok: true,
    session: {
      user: {
        id: String(u["id"]),
        email: (u["email"] as string | null) ?? null,
        fullName: ((u["fullName"] ?? u["full_name"]) as string | null) ?? null,
      },
      profile: (source["profile"] as ProfileDTO | null) ?? null,
      isAdmin: Boolean(source["isAdmin"] ?? source["is_admin"]),
    },
  };
}

export async function signInWithPassword(opts: {
  data: { email: string; password: string };
}): Promise<AuthResult> {
  if (usesPhpAuthApi) return php("login.php", opts.data);
  try {
    return normalize(await signInServerFn({ data: opts.data }), "Incorrect email or password.");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Log in failed" };
  }
}

export async function signUpWithPassword(opts: {
  data: { email: string; password: string; fullName?: string };
}): Promise<AuthResult> {
  if (usesPhpAuthApi) return php("signup.php", opts.data);
  try {
    return normalize(await signUpServerFn({ data: opts.data }), "Sign up failed");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Sign up failed" };
  }
}

export async function getCurrentSession(): Promise<SessionDTO> {
  if (usesPhpAuthApi) {
    const result = await php("session.php");
    return result.ok ? result.session : EMPTY_SESSION;
  }
  try {
    const result = normalize(await getSessionServerFn(), "");
    return result.ok ? result.session : EMPTY_SESSION;
  } catch {
    return EMPTY_SESSION;
  }
}

export async function signOut(): Promise<void> {
  if (usesPhpAuthApi) {
    await php("logout.php", {});
    return;
  }
  try {
    await signOutServerFn();
  } catch {
    /* the local session is cleared by the caller regardless */
  }
}
