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
  findMemoryIdByHash,
  prepareCached,
  toSafeInteger,
  withImmediateTransaction,
  withSavepoint,
} from './db.js';

const MAX_TAGS = 100;
const TAG_PATTERN = /^\S+$/;

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

const validateTag = (tag: string): void => {
  if (tag.length === 0) throw new Error('Tag must be at least 1 character');
  if (tag.length > 50) throw new Error('Tag exceeds 50 characters');
  if (!TAG_PATTERN.test(tag))
    throw new Error('Tag must not contain whitespace');
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

const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;

  const stmt = prepareCached(
    'INSERT OR IGNORE INTO tags (memory_id, tag) SELECT ?, value FROM json_each(?)'
  );
  executeRun(stmt, memoryId, JSON.stringify(tags));
};

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  const stmtDelete = prepareCached('DELETE FROM tags WHERE memory_id = ?');
  executeRun(stmtDelete, memoryId);
  insertTags(memoryId, normalizeTags(tags, MAX_TAGS));
};

const buildHash = (content: string): string =>
  crypto.createHash('sha256').update(content).digest('hex');

const resolveMemoryId = (
  content: string,
  hash: string,
  importance: number,
  memoryType: MemoryType
): { id: number; isNew: boolean } => {
  const stmtInsert = prepareCached(
    'INSERT OR IGNORE INTO memories (content, hash, importance, memory_type) VALUES (?, ?, ?, ?) RETURNING id'
  );

  const inserted = executeGet(
    stmtInsert,
    content,
    hash,
    importance,
    memoryType
  );

  if (inserted) {
    return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
  }

  const existingId = findMemoryIdByHash(hash);
  if (existingId === undefined) {
    throw new Error('Failed to resolve memory id');
  }

  return { id: existingId, isNew: false };
};

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

export const createMemory = (input: {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memory_type?: MemoryType;
}): MemoryInsertResult =>
  withImmediateTransaction(() => createMemoryInTransaction(input));

const createMemoryWithSavepoint = (
  index: number,
  item: {
    content: string;
    tags?: readonly string[];
    importance?: number;
    memory_type?: MemoryType;
  },
  signal?: AbortSignal
): BatchStoreItemResult => {
  const savepointName = `mem_item_${index}`;

  try {
    throwIfAborted(signal);
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

const createMemoriesInTransaction = (
  items: {
    content: string;
    tags?: readonly string[];
    importance?: number;
    memory_type?: MemoryType;
  }[],
  signal?: AbortSignal
): BatchStoreResult => {
  const results: BatchStoreItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  throwIfAborted(signal);
  for (let i = 0; i < items.length; i++) {
    throwIfAborted(signal);
    const item = items[i];
    if (!item) continue;

    const result = createMemoryWithSavepoint(i, item, signal);
    results.push(result);

    if (result.ok) succeeded++;
    else failed++;
  }

  return { results, succeeded, failed };
};

export const createMemories = (
  items: {
    content: string;
    tags?: readonly string[];
    importance?: number;
    memory_type?: MemoryType;
  }[],
  signal?: AbortSignal
): BatchStoreResult =>
  withImmediateTransaction(() => createMemoriesInTransaction(items, signal));

interface UpdateMemoryOptions {
  content: string;
  tags?: readonly string[] | undefined;
}

const assertNoDuplicateOnUpdate = (oldHash: string, newHash: string): void => {
  if (newHash === oldHash) return;

  const existingId = findMemoryIdByHash(newHash);
  if (existingId !== undefined) {
    throw new Error('Content already exists as another memory');
  }
};

const updateMemoryInTransaction = (
  hash: string,
  options: UpdateMemoryOptions
): MemoryUpdateResult => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) throw new Error('Memory not found');

  const newHash = buildHash(options.content);

  assertNoDuplicateOnUpdate(hash, newHash);

  const stmtUpdateContent = prepareCached(
    'UPDATE memories SET content = ?, hash = ? WHERE id = ?'
  );
  executeRun(stmtUpdateContent, options.content, newHash, memoryId);

  if (options.tags !== undefined) {
    replaceTags(memoryId, options.tags);
  }

  return { updated: true, oldHash: hash, newHash };
};

export const updateMemory = (
  hash: string,
  options: UpdateMemoryOptions
): MemoryUpdateResult =>
  withImmediateTransaction(() => updateMemoryInTransaction(hash, options));
