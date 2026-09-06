import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

const COOKIE = "nb_session";
const SESSION_DAYS = 30;

export type AuthUserDTO = { id: string; email: string | null; fullName: string | null };
export type SessionDTO = {
  user: AuthUserDTO | null;
  profile: Record<string, unknown> | null;
  isAdmin: boolean;
};

// ---------- helpers (server-only, Worker-safe Web Crypto) ----------

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

/** Format: pbkdf2$<iterations>$<salt>$<hash> */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replace(/-/g, "");
  return `pbkdf2$100000$${salt}$${await pbkdf2(password, salt)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  return (await pbkdf2(password, parts[2]!)) === parts[3];
}

function readCookie(name: string): string | null {
  const raw = getRequestHeader("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setSessionCookie(token: string, maxAgeSeconds: number) {
  setResponseHeader(
    "set-cookie",
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSeconds}`,
  );
}

async function createSession(userId: string): Promise<void> {
  const { execute } = await import("@/lib/db/mysql.server");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await execute(
    "INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, NOW(), ?)",
    [tokenHash, userId, expires],
  );
  setSessionCookie(token, SESSION_DAYS * 86_400);
}

// ---------- server functions ----------

export const signUpWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; fullName?: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!email || !data.password || data.password.length < 6) {
      return { ok: false as const, error: "Enter a valid email and a password of 6+ characters." };
    }
    const { queryOne, execute } = await import("@/lib/db/mysql.server");

    const existing = await queryOne<{ id: string }>(
      "SELECT id FROM auth_users WHERE email = ? LIMIT 1",
      [email],
    );
    if (existing) return { ok: false as const, error: "An account with this email already exists." };

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(data.password);
    await execute(
      "INSERT INTO auth_users (id, email, password_hash, full_name, email_verified, suspended, created_at) VALUES (?, ?, ?, ?, 0, 0, NOW())",
      [id, email, passwordHash, data.fullName?.trim() || null],
    );
    await execute(
      "INSERT IGNORE INTO profiles (id, email, full_name, created_at) VALUES (?, ?, ?, NOW())",
      [id, email, data.fullName?.trim() || null],
    );
    await execute("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'user')", [id]);
    await createSession(id);
    return { ok: true as const, user: { id, email, fullName: data.fullName ?? null } };
  });

export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const { queryOne } = await import("@/lib/db/mysql.server");
    const user = await queryOne<{
      id: string;
      email: string;
      password_hash: string;
      full_name: string | null;
      suspended: number;
    }>(
      "SELECT id, email, password_hash, full_name, suspended FROM auth_users WHERE email = ? LIMIT 1",
      [email],
    );
    if (!user || !(await verifyPassword(data.password, user.password_hash))) {
      return { ok: false as const, error: "Incorrect email or password." };
    }
    if (user.suspended) return { ok: false as const, error: "This account is suspended." };

    await createSession(user.id);
    return {
      ok: true as const,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
  });

export const getCurrentSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionDTO> => {
    const token = readCookie(COOKIE);
    if (!token) return { user: null, profile: null, isAdmin: false };

    const { queryOne } = await import("@/lib/db/mysql.server");
    const tokenHash = await sha256(token);
    const row = await queryOne<{ id: string; email: string; full_name: string | null }>(
      `SELECT u.id, u.email, u.full_name
         FROM auth_sessions s
         JOIN auth_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.suspended = 0
        LIMIT 1`,
      [tokenHash],
    );
    if (!row) return { user: null, profile: null, isAdmin: false };

    const profile = await queryOne<Record<string, unknown>>(
      "SELECT * FROM profiles WHERE id = ? LIMIT 1",
      [row.id],
    );
    const admin = await queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM user_roles WHERE user_id = ? AND role = 'admin'",
      [row.id],
    );
    return {
      user: { id: row.id, email: row.email, fullName: row.full_name },
      profile,
      isAdmin: Number(admin?.c ?? 0) > 0,
    };
  },
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const token = readCookie(COOKIE);
  if (token) {
    const { execute } = await import("@/lib/db/mysql.server");
    await execute("DELETE FROM auth_sessions WHERE token_hash = ?", [await sha256(token)]);
  }
  setSessionCookie("", 0);
  return { ok: true as const };
});
