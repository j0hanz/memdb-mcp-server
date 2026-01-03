import { db } from './database.js';
import { executeGet, executeRun } from './db-helpers.js';
import { toSafeInteger } from './row-mappers.js';

export const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = executeGet(
    db.prepare('SELECT id FROM memories WHERE hash = ?'),
    hash
  );
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

export const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO tags (memory_id, tag) VALUES (?, ?)'
  );
  for (const tag of tags) {
    executeRun(insertTag, memoryId, tag);
  }
};
