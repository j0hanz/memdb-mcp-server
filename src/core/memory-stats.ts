import type { MemoryStats } from '../types/index.js';
import { db } from './database.js';
import { executeAll, executeGet } from './db-helpers.js';
import { type DbRow, toSafeInteger } from './row-mappers.js';

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

const queryCountRow = (sql: string, label: string): DbRow => {
  const row = executeGet(db.prepare(sql));
  if (!row) {
    throw new Error(`Failed to load ${label} stats`);
  }
  return row;
};

const queryCounts = (): {
  memoryRow: DbRow;
  relationshipRow: DbRow;
  tagRow: DbRow;
} => {
  const memoryRow = queryCountRow(
    'SELECT COUNT(*) as count FROM memories',
    'memory'
  );
  const relationshipRow = queryCountRow(
    'SELECT COUNT(*) as count FROM relationships',
    'relationship'
  );
  const tagRow = queryCountRow(
    'SELECT COUNT(DISTINCT tag) as count FROM tags',
    'tag'
  );
  return { memoryRow, relationshipRow, tagRow };
};

export const getStats = (): MemoryStats => {
  const { memoryRow, relationshipRow, tagRow } = queryCounts();
  const typeRows = executeAll(
    db.prepare(
      'SELECT memory_type, COUNT(*) as count FROM memories GROUP BY memory_type'
    )
  );
  const dateRow = executeGet(
    db.prepare(
      'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories'
    )
  );

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
