import type { Memory, MemoryStats, StatementResult } from '../types.js';
import {
  db,
  type DbRow,
  executeAll,
  executeGet,
  executeRun,
  mapRowToMemory,
  toSafeInteger,
} from './db.js';

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

const stmtMemoryCount = db.prepare('SELECT COUNT(*) as count FROM memories');
const stmtRelationshipCount = db.prepare(
  'SELECT COUNT(*) as count FROM relationships'
);
const stmtTagCount = db.prepare(
  'SELECT COUNT(DISTINCT tag) as count FROM tags'
);
const stmtMemoryTypes = db.prepare(
  'SELECT memory_type, COUNT(*) as count FROM memories GROUP BY memory_type'
);
const stmtDateRange = db.prepare(
  'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories'
);

const buildMemoryTypes = (typeRows: DbRow[]): Record<string, number> => {
  const memoryTypes: Record<string, number> = {};
  for (const row of typeRows) {
    const rawType = row.memory_type;
    const typeKey = typeof rawType === 'string' ? rawType : 'unknown';
    memoryTypes[typeKey] = toSafeInteger(row.count, 'typeCount');
  }
  return memoryTypes;
};

const toDateString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
};

const queryCounts = (): {
  memoryRow: DbRow;
  relationshipRow: DbRow;
  tagRow: DbRow;
} => {
  const memoryRow = executeGet(stmtMemoryCount);
  const relationshipRow = executeGet(stmtRelationshipCount);
  const tagRow = executeGet(stmtTagCount);
  if (!memoryRow) throw new Error('Failed to load memory stats');
  if (!relationshipRow) throw new Error('Failed to load relationship stats');
  if (!tagRow) throw new Error('Failed to load tag stats');
  return { memoryRow, relationshipRow, tagRow };
};

export const getStats = (): MemoryStats => {
  const { memoryRow, relationshipRow, tagRow } = queryCounts();
  const typeRows = executeAll(stmtMemoryTypes);
  const dateRow = executeGet(stmtDateRange);

  return {
    memoryCount: toSafeInteger(memoryRow.count, 'memoryCount'),
    relationshipCount: toSafeInteger(
      relationshipRow.count,
      'relationshipCount'
    ),
    tagCount: toSafeInteger(tagRow.count, 'tagCount'),
    memoryTypes: buildMemoryTypes(typeRows),
    oldestMemory: toDateString(dateRow?.oldest),
    newestMemory: toDateString(dateRow?.newest),
  };
};
