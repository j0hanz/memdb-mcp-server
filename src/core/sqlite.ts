import type { StatementSync } from 'node:sqlite';

import { db } from './database.js';
import type { DbRow } from './row-mappers.js';

export type SqlParam = string | number | bigint | null | Uint8Array;

const MAX_CACHED_STATEMENTS = 200;
const statementCache = new Map<string, StatementSync>();
const statementCacheOrder: string[] = [];

const enforceStatementCacheLimit = (): void => {
  if (statementCacheOrder.length <= MAX_CACHED_STATEMENTS) return;
  const oldestSql = statementCacheOrder.shift();
  if (!oldestSql) return;

  const toEvict = statementCache.get(oldestSql);
  statementCache.delete(oldestSql);
  void toEvict;
};

const isDbRow = (value: unknown): value is DbRow => {
  return typeof value === 'object' && value !== null;
};

const toDbRowArray = (value: unknown): DbRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected rows array');
  }
  const rows: DbRow[] = [];
  for (const row of value) {
    if (!isDbRow(row)) {
      throw new Error('Invalid row');
    }
    rows.push(row);
  }
  return rows;
};

const toDbRowOrUndefined = (value: unknown): DbRow | undefined => {
  if (value === undefined) return undefined;
  if (!isDbRow(value)) {
    throw new Error('Invalid row');
  }
  return value;
};

const toRunResult = (value: unknown): { changes: number | bigint } => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid run result');
  }
  const changes: unknown = Reflect.get(value, 'changes');
  if (typeof changes !== 'number' && typeof changes !== 'bigint') {
    throw new Error('Invalid run result');
  }
  return { changes };
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
): DbRow[] => toDbRowArray(stmt.all(...params));

export const executeGet = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow | undefined => toDbRowOrUndefined(stmt.get(...params));

export const executeRun = (
  stmt: StatementSync,
  ...params: SqlParam[]
): { changes: number | bigint } => toRunResult(stmt.run(...params));

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
