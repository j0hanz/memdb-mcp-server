import type { StatementSync } from 'node:sqlite';

import { db } from './database.js';
import { toSafeInteger } from './row-mappers.js';
import { executeGet, executeRun, type SqlParam } from './sqlite.js';

const stmtFindMemoryIdByHash = db.prepare(
  'SELECT id FROM memories WHERE hash = ?'
);

const buildTagInsert = (
  memoryId: number,
  tags: readonly string[]
): { params: SqlParam[] } => {
  const params: SqlParam[] = tags.flatMap((tag) => [memoryId, tag]);
  return { params };
};

const tagInsertStatements: (StatementSync | undefined)[] = [];

const getInsertTagsStatement = (tagCount: number): StatementSync => {
  const cached = tagInsertStatements[tagCount];
  if (cached) return cached;

  const placeholders = Array.from({ length: tagCount }, () => '(?, ?)').join(
    ', '
  );
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO tags (memory_id, tag) VALUES ${placeholders}`
  );
  tagInsertStatements[tagCount] = stmt;
  return stmt;
};

export const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = executeGet(stmtFindMemoryIdByHash, hash);
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

export const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;
  const { params } = buildTagInsert(memoryId, tags);
  const stmt = getInsertTagsStatement(tags.length);
  executeRun(stmt, ...params);
};
