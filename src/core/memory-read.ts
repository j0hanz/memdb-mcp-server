import type {
  BatchDeleteItemResult,
  BatchDeleteResult,
  Memory,
  MemoryStats,
  StatementResult,
} from '../types.js';
import {
  type DbRow,
  loadTagsForMemoryIds,
  mapRowToMemory,
  sqlGet,
  sqlRun,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal) return;
  if (typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
    return;
  }
  if (signal.aborted) {
    throw new Error('Operation aborted');
  }
};

const loadMemoryRowByHashAndTouch = (hash: string): DbRow | undefined =>
  sqlGet`
    UPDATE memories
    SET accessed_at = CURRENT_TIMESTAMP
    WHERE hash = ${hash}
    RETURNING *
  `;

export const getMemory = (hash: string): Memory | undefined => {
  return withImmediateTransaction(() => {
    const row = loadMemoryRowByHashAndTouch(hash);
    if (!row) return undefined;

    const id = toSafeInteger(row.id, 'id');
    const tags = loadTagsForMemoryIds([id]).get(id) ?? [];

    return mapRowToMemory(row, tags);
  });
};

export const deleteMemory = (hash: string): StatementResult => {
  const result = sqlRun`DELETE FROM memories WHERE hash = ${hash}`;
  return { changes: toSafeInteger(result.changes, 'changes') };
};

const deleteMemoryForBatch = (
  hash: string
): { item: BatchDeleteItemResult; succeeded: boolean } => {
  try {
    const result = deleteMemory(hash);
    const deleted = result.changes > 0;

    if (!deleted) {
      return {
        item: { hash, deleted: false, error: 'Memory not found' },
        succeeded: false,
      };
    }

    return { item: { hash, deleted: true }, succeeded: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { item: { hash, deleted: false, error: message }, succeeded: false };
  }
};

export const deleteMemories = (
  hashes: string[],
  signal?: AbortSignal
): BatchDeleteResult => {
  return withImmediateTransaction(() => {
    const results: BatchDeleteItemResult[] = [];
    let succeeded = 0;
    let failed = 0;

    throwIfAborted(signal);
    for (const hash of hashes) {
      throwIfAborted(signal);
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

const queryCounts = (): { memoryRow: DbRow; tagRow: DbRow } => {
  const memoryRow = sqlGet`SELECT COUNT(*) as count FROM memories`;
  const tagRow = sqlGet`SELECT COUNT(DISTINCT tag) as count FROM tags`;

  if (!memoryRow) throw new Error('Failed to load memory stats');
  if (!tagRow) throw new Error('Failed to load tag stats');

  return { memoryRow, tagRow };
};

export const getStats = (): MemoryStats => {
  const { memoryRow, tagRow } = queryCounts();

  const dateRow = sqlGet`SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM memories`;

  return {
    memoryCount: toSafeInteger(memoryRow.count, 'memoryCount'),
    tagCount: toSafeInteger(tagRow.count, 'tagCount'),
    oldestMemory: toDateString(dateRow?.oldest),
    newestMemory: toDateString(dateRow?.newest),
  };
};
