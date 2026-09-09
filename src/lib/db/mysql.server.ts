import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

let pool: Pool | undefined;

/** Server-only env access that does not depend on Node type definitions. */
function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

/** Shared MySQL pool (Hostinger remote MySQL). Server-only. */
export function getPool(): Pool {
  if (!pool) {
    const options: PoolOptions = {
      host: env("MYSQL_HOST") ?? "",
      port: Number(env("MYSQL_PORT") ?? 3306),
      user: env("MYSQL_USER") ?? "",
      password: env("MYSQL_PASSWORD") ?? "",
      database: env("MYSQL_DATABASE") ?? "",
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
    };
    pool = createPool(options);
  }
  return pool;
}

type Param = string | number | boolean | Date | Buffer | null | undefined;

/** Run a SELECT and get typed rows back. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Param[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as unknown as T[];
}

/** Run a SELECT expecting at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: Param[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run an INSERT/UPDATE/DELETE. */
export async function execute(sql: string, params: Param[] = []): Promise<void> {
  await getPool().query(sql, params);
}
