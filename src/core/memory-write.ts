import crypto from 'node:crypto';

import type {
  BatchStoreItemResult,
  BatchStoreResult,
  MemoryInsertResult,
  MemoryType,
  MemoryUpdateResult,
} from '../types.js';
import {
  executeGet,
  executeRun,
  prepareCached,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

const MAX_TAGS = 100;
const TAG_PATTERN = /^\S+$/;

const validateTag = (tag: string): void => {
  if (tag.length === 0) {
    throw new Error('Tag must be at least 1 character');
  }
  if (tag.length > 50) {
    throw new Error('Tag exceeds 50 characters');
  }
  if (!TAG_PATTERN.test(tag)) {
    throw new Error('Tag must not contain whitespace');
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

const findMemoryIdByHash = (hash: string): number | undefined => {
  const stmtFindMemoryIdByHash = prepareCached(
    'SELECT id FROM memories WHERE hash = ?'
  );
  const row = executeGet(stmtFindMemoryIdByHash, hash);
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;
  const stmtInsertTags = prepareCached(
    'INSERT OR IGNORE INTO tags (memory_id, tag) SELECT ?, value FROM json_each(?)'
  );
  executeRun(stmtInsertTags, memoryId, JSON.stringify(tags));
};

const buildHash = (content: string): string => {
  return crypto.createHash('sha256').update(content).digest('hex');
};

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
  const stmtInsertMemory = prepareCached(
    'INSERT OR IGNORE INTO memories (content, hash, importance, memory_type) VALUES (?, ?, ?, ?) RETURNING id'
  );
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
  return withImmediateTransaction(() => createMemoriesInTransaction(items));
};

const withSavepoint = <T>(name: string, fn: () => T): T => {
  executeRun(prepareCached(`SAVEPOINT ${name}`));
  try {
    const result = fn();
    executeRun(prepareCached(`RELEASE ${name}`));
    return result;
  } catch (err) {
    executeRun(prepareCached(`ROLLBACK TO ${name}`));
    executeRun(prepareCached(`RELEASE ${name}`));
    throw err;
  }
};

const createMemoriesInTransaction = (
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    const result = createMemoryWithSavepoint(i, item);
    results.push(result);
    if (result.ok) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { results, succeeded, failed };
};

const createMemoryWithSavepoint = (
  index: number,
  item: {
    content: string;
    tags?: readonly string[];
    importance?: number;
    memory_type?: MemoryType;
  }
): BatchStoreItemResult => {
  const savepointName = `mem_item_${index}`;
  try {
    const created = withSavepoint(savepointName, () =>
      createMemoryInTransaction(item)
    );
    return {
      ok: true,
      index,
      hash: created.hash,
      isNew: created.isNew,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, index, error: message };
  }
};

interface UpdateMemoryOptions {
  content: string;
  tags?: readonly string[] | undefined;
}

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  const stmtDeleteTagsForMemory = prepareCached(
    'DELETE FROM tags WHERE memory_id = ?'
  );
  executeRun(stmtDeleteTagsForMemory, memoryId);
  insertTags(memoryId, normalizeTags(tags, MAX_TAGS));
};

const assertNoDuplicateOnUpdate = (oldHash: string, newHash: string): void => {
  if (newHash === oldHash) return;
  const existingId = findMemoryIdByHash(newHash);
  if (existingId !== undefined) {
    throw new Error('Content already exists as another memory');
  }
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
    assertNoDuplicateOnUpdate(hash, newHash);

    // Update content and hash
    const stmtUpdateContent = prepareCached(
      'UPDATE memories SET content = ?, hash = ? WHERE id = ?'
    );
    executeRun(stmtUpdateContent, options.content, newHash, memoryId);

    // Update tags if provided, otherwise preserve existing tags
    if (options.tags !== undefined) {
      replaceTags(memoryId, options.tags);
    }

    return { updated: true, oldHash: hash, newHash };
  });
};
