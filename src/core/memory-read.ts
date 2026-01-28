import type {
  BatchDeleteItemResult,
  BatchDeleteResult,
  Memory,
  MemoryStats,
  StatementResult,
} from '../types.js';
import {
  type DbRow,
  executeGet,
  executeRun,
  loadTagsForMemoryIds,
  mapRowToMemory,
  prepareCached,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

export const getMemory = (hash: string): Memory | undefined => {
  return withImmediateTransaction(() => {
    const stmtTouchMemoryByHash = prepareCached(
      'UPDATE memories SET accessed_at = CURRENT_TIMESTAMP WHERE hash = ?'
    );
    executeRun(stmtTouchMemoryByHash, hash);

    const stmtGetMemoryByHash = prepareCached(
      'SELECT * FROM memories WHERE hash = ?'
    );
    const row = executeGet(stmtGetMemoryByHash, hash);

    if (!row) return undefined;
    const id = toSafeInteger(row.id, 'id');
    const tags = loadTagsForMemoryIds([id]).get(id) ?? [];
    return mapRowToMemory(row, tags);
  });
};

export const deleteMemory = (hash: string): StatementResult => {
  const stmtDeleteMemoryByHash = prepareCached(
    'DELETE FROM memories WHERE hash = ?'
  );
  const result = executeRun(stmtDeleteMemoryByHash, hash);
  return { changes: toSafeInteger(result.changes, 'changes') };
};

const deleteMemoryForBatch = (
  hash: string
): { item: BatchDeleteItemResult; succeeded: boolean } => {
  try {
    const result = deleteMemory(hash);
    const deleted = result.changes > 0;
    return deleted
      ? { item: { hash, deleted: true }, succeeded: true }
      : {
          item: { hash, deleted: false, error: 'Memory not found' },
          succeeded: false,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { item: { hash, deleted: false, error: message }, succeeded: false };
  }
};

export const deleteMemories = (hashes: string[]): BatchDeleteResult => {
  const results: BatchDeleteItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  return withImmediateTransaction(() => {
    for (const hash of hashes) {
      const outcome = deleteMemoryForBatch(hash);
      results.push(outcome.item);
      succeeded += outcome.succeeded ? 1 : 0;
      failed += outcome.succeeded ? 0 : 1;
    }

    return { results, succeeded, failed };
  });
};

const toDateString = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
};

const queryCounts = (): {
  memoryRow: DbRow;
  tagRow: DbRow;
} => {
  const stmtMemoryCount = prepareCached(
    'SELECT COUNT(*) as count FROM memories'
  );
  const memoryRow = executeGet(stmtMemoryCount);

  const stmtTagCount = prepareCached(
    'SELECT COUNT(DISTINCT tag) as count FROM tags'
  );
  const tagRow = executeGet(stmtTagCount);

  if (!memoryRow) throw new Error('Failed to load memory stats');
  if (!tagRow) throw new Error('Failed to load tag stats');
  return { memoryRow, tagRow };
};

export const getStats = (): MemoryStats => {
  const { memoryRow, tagRow } = queryCounts();

  const stmtDateRange = prepareCached(
    'SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories'
  );
  const dateRow = executeGet(stmtDateRange);

  return {
    memoryCount: toSafeInteger(memoryRow.count, 'memoryCount'),
    tagCount: toSafeInteger(tagRow.count, 'tagCount'),
    oldestMemory: toDateString(dateRow?.oldest),
    newestMemory: toDateString(dateRow?.newest),
  };
};
