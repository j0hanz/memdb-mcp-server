import type { Memory, StatementResult } from '../types/index.js';
import { db } from './database.js';
import { executeGet, executeRun } from './db-helpers.js';
import { mapRowToMemory, toSafeInteger } from './row-mappers.js';

export const getMemory = (hash: string): Memory | undefined => {
  const row = executeGet(
    db.prepare('SELECT * FROM memories WHERE hash = ?'),
    hash
  );
  return row ? mapRowToMemory(row) : undefined;
};

export const deleteMemory = (hash: string): StatementResult => {
  const result = executeRun(
    db.prepare('DELETE FROM memories WHERE hash = ?'),
    hash
  );
  return { changes: toSafeInteger(result.changes, 'changes') };
};
