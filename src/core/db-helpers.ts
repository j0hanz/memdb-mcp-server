import type { StatementSync } from 'node:sqlite';

import { db } from './database.js';
import type { DbRow } from './row-mappers.js';

export type SqlParam = string | number | bigint | null | Uint8Array;

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
