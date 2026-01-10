import crypto from 'node:crypto';
import type { StatementSync } from 'node:sqlite';

import type { MemoryInsertResult, MemoryUpdateResult } from '../types.js';
import {
  db,
  executeGet,
  executeRun,
  type SqlParam,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

const MAX_TAGS = 100;

const validateTag = (tag: string): void => {
  if (tag.length === 0) {
    throw new Error('Tag must be at least 1 character');
  }
  if (tag.length > 50) {
    throw new Error('Tag exceeds 50 characters');
  }
};

const validateTagCount = (tags: readonly string[], maxTags: number): void => {
  if (tags.length > maxTags) {
    throw new Error(`Too many tags (max ${maxTags})`);
  }
};

const dedupeTags = (tags: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const tag of tags) {
    validateTag(tag);
    seen.add(tag);
  }
  return [...seen];
};

export const normalizeTags = (
  tags: readonly string[],
  maxTags: number
): string[] => {
  if (tags.length === 0) return [];
  validateTagCount(tags, maxTags);
  return dedupeTags(tags);
};

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

const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;
  const { params } = buildTagInsert(memoryId, tags);
  const stmt = getInsertTagsStatement(tags.length);
  executeRun(stmt, ...params);
};

const buildHash = (content: string): string => {
  // eslint-disable-next-line sonarjs/hashing -- MD5 used for non-security deduplication only.
  return crypto.createHash('md5').update(content).digest('hex');
};

const stmtInsertMemory = db.prepare(
  'INSERT OR IGNORE INTO memories (content, importance, memory_type, hash) ' +
    'VALUES (?, ?, ?, ?) RETURNING id'
);

const requireMemoryId = (id: number | undefined): number => {
  if (id === undefined) {
    throw new Error('Failed to resolve memory id');
  }
  return id;
};

const resolveMemoryId = (input: {
  content: string;
  importance: number;
  memoryType: string;
  hash: string;
}): { id: number; isNew: boolean } => {
  const inserted = executeGet(
    stmtInsertMemory,
    input.content,
    input.importance,
    input.memoryType,
    input.hash
  );
  if (inserted) {
    return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
  }

  const id = requireMemoryId(findMemoryIdByHash(input.hash));
  return { id, isNew: false };
};

export const createMemory = (input: {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memoryType?: string;
}): MemoryInsertResult =>
  withImmediateTransaction(() => {
    const {
      content,
      tags = [],
      importance = 0,
      memoryType = 'general',
    } = input;
    const hash = buildHash(content);
    const normalizedTags = normalizeTags(tags, MAX_TAGS);
    const { id, isNew } = resolveMemoryId({
      content,
      importance,
      memoryType,
      hash,
    });
    insertTags(id, normalizedTags);
    return { id, hash, isNew };
  });

const stmtDeleteTagsForMemory = db.prepare(
  'DELETE FROM tags WHERE memory_id = ?'
);

interface UpdateMemoryOptions {
  importance?: number | undefined;
  memoryType?: string | undefined;
  tags?: readonly string[] | undefined;
}

const stmtUpdateImportance = db.prepare(
  'UPDATE memories SET importance = ? WHERE id = ?'
);
const stmtUpdateMemoryType = db.prepare(
  'UPDATE memories SET memory_type = ? WHERE id = ?'
);
const stmtUpdateImportanceAndType = db.prepare(
  'UPDATE memories SET importance = ?, memory_type = ? WHERE id = ?'
);

const updateMetadataFields = (
  memoryId: number,
  options: UpdateMemoryOptions
): void => {
  if (options.importance !== undefined && options.memoryType !== undefined) {
    executeRun(
      stmtUpdateImportanceAndType,
      options.importance,
      options.memoryType,
      memoryId
    );
    return;
  }
  if (options.importance !== undefined) {
    executeRun(stmtUpdateImportance, options.importance, memoryId);
    return;
  }
  if (options.memoryType !== undefined) {
    executeRun(stmtUpdateMemoryType, options.memoryType, memoryId);
  }
};

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  executeRun(stmtDeleteTagsForMemory, memoryId);
  insertTags(memoryId, normalizeTags(tags, MAX_TAGS));
};

const updateTags = (memoryId: number, options: UpdateMemoryOptions): void => {
  if (options.tags !== undefined) {
    replaceTags(memoryId, options.tags);
  }
};

export const updateMemory = (
  hash: string,
  options: UpdateMemoryOptions
): MemoryUpdateResult => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) throw new Error('Memory not found');

  return withImmediateTransaction(() => {
    updateMetadataFields(memoryId, options);
    updateTags(memoryId, options);
    return { updated: true, hash };
  });
};
