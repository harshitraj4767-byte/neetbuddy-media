// Single entry point for auth used by the UI.
//
// - On Lovable / any Node-or-Worker deployment: uses the TanStack server functions.
// - On static hosting (Hostinger), set VITE_AUTH_API_BASE (e.g. "/api/auth") at
//   build time and the same calls go to the PHP endpoints in public/api/auth.
//
// Signatures mirror src/lib/auth-mysql.functions.ts so call sites are unchanged.

export type AuthUserDTO = { id: string; email: string | null; fullName: string | null };
export type ProfileDTO = Record<string, string | number | boolean | null>;
export type SessionDTO = {
  user: AuthUserDTO | null;
  profile: ProfileDTO | null;
  isAdmin: boolean;
};

const PHP_BASE = (
  (import.meta.env as Record<string, string | undefined>)["VITE_AUTH_API_BASE"] ?? ""
).replace(/\/+$/, "");

export const usesPhpAuthApi = PHP_BASE !== "";

async function php<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PHP_BASE}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

type ServerAuthModule = {
  signInWithPassword: (opts: {
    data: { email: string; password: string };
  }) => Promise<SessionDTO>;
  signUpWithPassword: (opts: {
    data: { email: string; password: string; fullName?: string };
  }) => Promise<SessionDTO>;
  getCurrentSession: () => Promise<SessionDTO>;
  signOut: () => Promise<unknown>;
};

async function serverAuth(): Promise<ServerAuthModule> {
  return (await import("@/lib/auth-mysql.functions")) as unknown as ServerAuthModule;
}

export async function signInWithPassword(opts: {
  data: { email: string; password: string };
}): Promise<SessionDTO> {
  if (usesPhpAuthApi) return php<SessionDTO>("login.php", opts.data);
  return (await serverAuth()).signInWithPassword(opts);
}

export async function signUpWithPassword(opts: {
  data: { email: string; password: string; fullName?: string };
}): Promise<SessionDTO> {
  if (usesPhpAuthApi) return php<SessionDTO>("signup.php", opts.data);
  return (await serverAuth()).signUpWithPassword(opts);
}

export async function getCurrentSession(): Promise<SessionDTO> {
  if (usesPhpAuthApi) return php<SessionDTO>("session.php");
  return (await serverAuth()).getCurrentSession();
}

export async function signOut(): Promise<void> {
  if (usesPhpAuthApi) {
    await php<{ ok: boolean }>("logout.php", {});
    return;
  }
  await (await serverAuth()).signOut();
}
