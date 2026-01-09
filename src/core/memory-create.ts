import crypto from 'node:crypto';

import type { MemoryInsertResult } from '../types/index.js';
import { db } from './database.js';
import { findMemoryIdByHash, insertTags } from './memory-db.js';
import { toSafeInteger } from './row-mappers.js';
import { executeGet, withImmediateTransaction } from './sqlite.js';
import { normalizeTags } from './tags.js';

const MAX_TAGS = 100;

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
