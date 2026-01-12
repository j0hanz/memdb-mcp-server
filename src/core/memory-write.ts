import crypto from 'node:crypto';
import type { StatementSync } from 'node:sqlite';

import type {
  BatchStoreItemResult,
  BatchStoreResult,
  MemoryInsertResult,
  MemoryType,
  MemoryUpdateResult,
} from '../types.js';
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

const normalizeTags = (tags: readonly string[], maxTags: number): string[] => {
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

const findMemoryIdByHash = (hash: string): number | undefined => {
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
  'INSERT OR IGNORE INTO memories (content, hash, importance, memory_type) VALUES (?, ?, ?, ?) RETURNING id'
);

const requireMemoryId = (id: number | undefined): number => {
  if (id === undefined) {
    throw new Error('Failed to resolve memory id');
  }
  return id;
};

const resolveMemoryId = (
  content: string,
  hash: string,
  importance: number,
  memoryType: string
): { id: number; isNew: boolean } => {
  const inserted = executeGet(
    stmtInsertMemory,
    content,
    hash,
    importance,
    memoryType
  );
  if (inserted) {
    return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
  }

  const id = requireMemoryId(findMemoryIdByHash(hash));
  return { id, isNew: false };
};

export const createMemory = (input: {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memory_type?: MemoryType;
}): MemoryInsertResult =>
  withImmediateTransaction(() => createMemoryInTransaction(input));

const createMemoryInTransaction = (input: {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memory_type?: MemoryType;
}): MemoryInsertResult => {
  const {
    content,
    tags = [],
    importance = 0,
    memory_type: memoryType = 'general',
  } = input;
  const hash = buildHash(content);
  const normalizedTags = normalizeTags(tags, MAX_TAGS);
  const { id, isNew } = resolveMemoryId(content, hash, importance, memoryType);
  insertTags(id, normalizedTags);
  return { id, hash, isNew };
};

export const createMemories = (
  items: {
    content: string;
    tags?: readonly string[];
    importance?: number;
    memory_type?: MemoryType;
  }[]
): BatchStoreResult => {
  const results: BatchStoreItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  return withImmediateTransaction(() => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      db.exec('SAVEPOINT mem_item');
      try {
        const { hash, isNew } = createMemoryInTransaction(item);
        results.push({ ok: true, index: i, hash, isNew });
        succeeded++;
        db.exec('RELEASE mem_item');
      } catch (err) {
        db.exec('ROLLBACK TO mem_item');
        db.exec('RELEASE mem_item');
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({ ok: false, index: i, error: message });
        failed++;
      }
    }

    return { results, succeeded, failed };
  });
};

const stmtDeleteTagsForMemory = db.prepare(
  'DELETE FROM tags WHERE memory_id = ?'
);

const stmtUpdateContent = db.prepare(
  'UPDATE memories SET content = ?, hash = ? WHERE id = ?'
);

interface UpdateMemoryOptions {
  content: string;
  tags?: readonly string[] | undefined;
}

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  executeRun(stmtDeleteTagsForMemory, memoryId);
  insertTags(memoryId, normalizeTags(tags, MAX_TAGS));
};

export const updateMemory = (
  hash: string,
  options: UpdateMemoryOptions
): MemoryUpdateResult => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) throw new Error('Memory not found');

  return withImmediateTransaction(() => {
    const newHash = buildHash(options.content);

    // Check if new content would create a duplicate
    if (newHash !== hash) {
      const existingId = findMemoryIdByHash(newHash);
      if (existingId !== undefined) {
        throw new Error('Content already exists as another memory');
      }
    }

    // Update content and hash
    executeRun(stmtUpdateContent, options.content, newHash, memoryId);

    // Update tags if provided, otherwise preserve existing tags
    if (options.tags !== undefined) {
      replaceTags(memoryId, options.tags);
    }

    return { updated: true, oldHash: hash, newHash };
  });
};
