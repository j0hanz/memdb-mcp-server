import type { StatementSync } from 'node:sqlite';

import { db } from './database.js';
import type { DbRow } from './row-mappers.js';

export type SqlParam = string | number | bigint | null | Uint8Array;

const MAX_CACHED_STATEMENTS = 200;
const statementCache = new Map<string, StatementSync>();
const statementCacheOrder: string[] = [];

type FinalizableStatement = StatementSync & { finalize?: () => void };

const enforceStatementCacheLimit = (): void => {
  if (statementCacheOrder.length <= MAX_CACHED_STATEMENTS) return;
  const oldestSql = statementCacheOrder.shift();
  if (!oldestSql) return;

  const toEvict = statementCache.get(oldestSql);
  statementCache.delete(oldestSql);
  (toEvict as FinalizableStatement | undefined)?.finalize?.();
};

export const prepareCached = (sql: string): StatementSync => {
  const cached = statementCache.get(sql);
  if (cached) return cached;

  const stmt = db.prepare(sql);
  statementCache.set(sql, stmt);
  statementCacheOrder.push(sql);

  enforceStatementCacheLimit();

  return stmt;
};

export const executeAll = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow[] => stmt.all(...params) as DbRow[];

export const executeGet = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow | undefined => stmt.get(...params) as DbRow | undefined;

export const executeRun = (
  stmt: StatementSync,
  ...params: SqlParam[]
): { changes: number | bigint } =>
  stmt.run(...params) as {
    changes: number | bigint;
  };

export const withImmediateTransaction = <T>(operation: () => T): T => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};
