import type { Memory, StatementResult } from '../types/index.js';
import { db } from './database.js';
import { executeGet, executeRun } from './db-helpers.js';
import { mapRowToMemory, toSafeInteger } from './row-mappers.js';

const stmtGetMemoryByHash = db.prepare('SELECT * FROM memories WHERE hash = ?');
const stmtDeleteMemoryByHash = db.prepare(
  'DELETE FROM memories WHERE hash = ?'
);

export const getMemory = (hash: string): Memory | undefined => {
  const row = executeGet(stmtGetMemoryByHash, hash);
  return row ? mapRowToMemory(row) : undefined;
};

export const deleteMemory = (hash: string): StatementResult => {
  const result = executeRun(stmtDeleteMemoryByHash, hash);
  return { changes: toSafeInteger(result.changes, 'changes') };
};
