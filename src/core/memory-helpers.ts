import { db } from './database.js';
import { executeGet, executeRun, type SqlParam } from './db-helpers.js';
import { toSafeInteger } from './row-mappers.js';

const buildTagInsert = (
  memoryId: number,
  tags: readonly string[]
): { placeholders: string; params: SqlParam[] } => {
  const placeholders = tags.map(() => '(?, ?)').join(', ');
  const params: SqlParam[] = tags.flatMap((tag) => [memoryId, tag]);
  return { placeholders, params };
};

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
  const { placeholders, params } = buildTagInsert(memoryId, tags);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO tags (memory_id, tag) VALUES ${placeholders}`
  );
  executeRun(stmt, ...params);
};
