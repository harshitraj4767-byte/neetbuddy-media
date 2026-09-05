// MySQL-backed auth server functions (Hostinger).
//
// Provides the four exports used by src/hooks/use-auth.tsx and
// src/routes/login.tsx:
//   - getCurrentSession   (GET)  -> { user, profile, isAdmin }
//   - signOut             (POST) -> { ok: true }
//   - signInWithPassword  (POST) -> { ok, error? }
//   - signUpWithPassword  (POST) -> { ok, error? }
//
// Required env vars (see .env.example):
//   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//
// Tables are created automatically on first use:
//   users (id, email, password_hash, full_name, created_at)
//   profiles (id PK, email, full_name, avatar_url, wallet_balance, ...)
//   user_roles (user_id, role)           -- role 'admin' grants isAdmin
//   sessions (token PK, user_id, expires_at)
//
// Sessions are random tokens stored in an httpOnly cookie ("nb_session")
// and in the sessions table (30 day expiry).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const COOKIE_NAME = "nb_session";
const SESSION_DAYS = 30;

type ProfileRow = {
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

type SessionResult = {
  user: { id: string; email: string | null; fullName: string | null } | null;
  profile: ProfileRow | null;
  isAdmin: boolean;
};

// ---------------------------------------------------------------------------
// Server-only helpers (loaded lazily so nothing Node-only leaks into the
// browser bundle).
// ---------------------------------------------------------------------------

async function getPool() {
  const mysql = await import("mysql2/promise");
  const g = globalThis as unknown as { __nbMysqlPool?: mysql.Pool };
  if (!g.__nbMysqlPool) {
    g.__nbMysqlPool = mysql.createPool({
      host: process.env["MYSQL_HOST"],
      port: Number(process.env["MYSQL_PORT"] ?? 3306),
      user: process.env["MYSQL_USER"],
      password: process.env["MYSQL_PASSWORD"],
      database: process.env["MYSQL_DATABASE"],
      waitForConnections: true,
      connectionLimit: 5,
      namedPlaceholders: false,
    });
  }
  return g.__nbMysqlPool;
}

async function ensureSchema(pool: import("mysql2/promise").Pool) {
  const g = globalThis as unknown as { __nbSchemaReady?: boolean };
  if (g.__nbSchemaReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS profiles (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(320) NULL,
    full_name VARCHAR(255) NULL,
    avatar_url TEXT NULL,
    wallet_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    deposit_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    winnings_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonus_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    xp_total INT NOT NULL DEFAULT 0,
    daily_goal INT NOT NULL DEFAULT 0,
    target_year INT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_roles (
    user_id CHAR(36) NOT NULL,
    role VARCHAR(50) NOT NULL,
    PRIMARY KEY (user_id, role)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(64) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id)
  )`);
  g.__nbSchemaReady = true;
}

async function hashPassword(password: string): Promise<string> {
  const { randomBytes, scrypt } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const hash = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { scrypt, timingSafeEqual } = await import("node:crypto");
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, expected.length, (err, key) => (err ? reject(err) : resolve(key)));
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function newToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}

async function newId(): Promise<string> {
  const { randomUUID } = await import("node:crypto");
  return randomUUID();
}

async function readSessionCookie(): Promise<string | null> {
  const { getCookie } = await import("@tanstack/react-start/server");
  return getCookie(COOKIE_NAME) ?? null;
}

async function writeSessionCookie(token: string) {
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    // "none" (with Secure) so the session survives the embedded preview /
    // installed-app webview, where the app runs in a third-party context and
    // Lax cookies are dropped on the way back to the server.
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

async function clearSessionCookie() {
  const { deleteCookie } = await import("@tanstack/react-start/server");
  deleteCookie(COOKIE_NAME, { path: "/" });
}

async function createSession(userId: string) {
  const pool = await getPool();
  const token = await newToken();
  await pool.query(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))",
    [token, userId, SESSION_DAYS],
  );
  await writeSessionCookie(token);
}

async function loadSession(): Promise<SessionResult> {
  const empty: SessionResult = { user: null, profile: null, isAdmin: false };
  const token = await readSessionCookie();
  if (!token) return empty;

  const pool = await getPool();
  await ensureSchema(pool);

  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.full_name
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > NOW()
     LIMIT 1`,
    [token],
  );
  const user = (rows as Array<{ id: string; email: string | null; full_name: string | null }>)[0];
  if (!user) return empty;

  const [profileRows] = await pool.query("SELECT * FROM profiles WHERE id = ? LIMIT 1", [user.id]);
  const profile = ((profileRows as ProfileRow[])[0] ?? null) as ProfileRow | null;

  const [roleRows] = await pool.query(
    "SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
    [user.id],
  );
  const isAdmin = (roleRows as unknown[]).length > 0;

  return {
    user: { id: user.id, email: user.email, fullName: user.full_name },
    profile,
    isAdmin,
  };
}

// ---------------------------------------------------------------------------
// Public server functions
// ---------------------------------------------------------------------------

// POST, not GET: GET server-fn responses can be served from an edge/browser
// cache, which would return a stale "signed out" session right after login.
export const getCurrentSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<SessionResult> => {
    try {
      return await loadSession();
    } catch (error) {
      console.error("[auth-mysql] getCurrentSession failed", error);
      return { user: null, profile: null, isAdmin: false };
    }
  },
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const token = await readSessionCookie();
    if (token) {
      const pool = await getPool();
      await ensureSchema(pool);
      await pool.query("DELETE FROM sessions WHERE token = ?", [token]);
    }
  } catch (error) {
    console.error("[auth-mysql] signOut cleanup failed", error);
  } finally {
    await clearSessionCookie();
  }
  return { ok: true };
});

export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ email: z.string().email().max(320), password: z.string().min(1).max(200) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const pool = await getPool();
      await ensureSchema(pool);
      const [rows] = await pool.query(
        "SELECT id, password_hash FROM users WHERE email = ? LIMIT 1",
        [data.email.toLowerCase()],
      );
      const user = (rows as Array<{ id: string; password_hash: string }>)[0];
      if (!user || !(await verifyPassword(data.password, user.password_hash))) {
        return { ok: false, error: "Invalid email or password." };
      }
      await createSession(user.id);
      return { ok: true };
    } catch (error) {
      console.error("[auth-mysql] signIn failed", error);
      return { ok: false, error: "Log in failed. Please try again." };
    }
  });

export const signUpWithPassword = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().max(320),
        password: z.string().min(6).max(200),
        fullName: z.string().max(255).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const pool = await getPool();
      await ensureSchema(pool);
      const email = data.email.toLowerCase();

      const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if ((existing as unknown[]).length > 0) {
        return { ok: false, error: "An account with this email already exists." };
      }

      const id = await newId();
      const passwordHash = await hashPassword(data.password);
      const fullName = data.fullName.trim() || null;

      await pool.query(
        "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
        [id, email, passwordHash, fullName],
      );
      await pool.query("INSERT INTO profiles (id, email, full_name) VALUES (?, ?, ?)", [
        id,
        email,
        fullName,
      ]);

      await createSession(id);
      return { ok: true };
    } catch (error) {
      console.error("[auth-mysql] signUp failed", error);
      return { ok: false, error: "Sign up failed. Please try again." };
    }
  });
