/// <reference types="node" />

import { createPool, type Pool, type PoolOptions } from "mysql2/promise";

let pool: Pool | undefined;

/** Shared MySQL pool (Hostinger remote MySQL). Server-only. */
export function getPool(): Pool {
  if (!pool) {
    const options: PoolOptions = {
      host: process.env["MYSQL_HOST"]!,
      port: Number(process.env["MYSQL_PORT"] ?? 3306),
      user: process.env["MYSQL_USER"]!,
      password: process.env["MYSQL_PASSWORD"]!,
      database: process.env["MYSQL_DATABASE"]!,
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
    };
    pool = createPool(options);
  }
  return pool;
}

/** Run a SELECT and get typed rows back. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query(sql, params);
  return rows as T[];
}

/** Run a SELECT expecting at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run an INSERT/UPDATE/DELETE. */
export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  await getPool().query(sql, params);
}
