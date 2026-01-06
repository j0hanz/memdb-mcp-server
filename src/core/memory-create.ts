import crypto from 'node:crypto';

import type { MemoryInsertResult } from '../types/index.js';
import { db } from './database.js';
import { findMemoryIdByHash, insertTags } from './memory-db.js';
import { toSafeInteger } from './row-mappers.js';
import { executeGet, withImmediateTransaction } from './sqlite.js';
import { normalizeTags } from './tags.js';

const buildHash = (content: string): string =>
  crypto.createHash('md5').update(content).digest('hex');

const stmtInsertMemory = db.prepare(
  'INSERT OR IGNORE INTO memories (content, importance, memory_type, hash) ' +
    'VALUES (?, ?, ?, ?) RETURNING id'
);

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

  const id = findMemoryIdByHash(input.hash);
  if (id === undefined) {
    throw new Error('Failed to resolve memory id');
  }
  return { id, isNew: false };
};

interface CreateMemoryInput {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memoryType?: string;
}

export const createMemory = (input: CreateMemoryInput): MemoryInsertResult =>
  withImmediateTransaction(() => {
    const {
      content,
      tags = [],
      importance = 0,
      memoryType = 'general',
    } = input;
    const hash = buildHash(content);
    const normalizedTags = normalizeTags(tags, 100);
    const { id, isNew } = resolveMemoryId({
      content,
      importance,
      memoryType,
      hash,
    });
    insertTags(id, normalizedTags);
    return { id, hash, isNew };
  });
