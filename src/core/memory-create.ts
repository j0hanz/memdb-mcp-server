import crypto from 'node:crypto';

import type { MemoryInsertResult } from '../types/index.js';
import { db } from './database.js';
import { executeRun, withImmediateTransaction } from './db-helpers.js';
import { findMemoryIdByHash, insertTags } from './memory-helpers.js';
import { toSafeInteger } from './row-mappers.js';
import { normalizeTags } from './tag-helpers.js';

const buildHash = (content: string): string =>
  crypto.createHash('md5').update(content).digest('hex');

export interface CreateMemoryInput {
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
    const insert = db.prepare(
      'INSERT OR IGNORE INTO memories (content, importance, ' +
        'memory_type, hash) VALUES (?, ?, ?, ?)'
    );
    const result = executeRun(insert, content, importance, memoryType, hash);
    const id = findMemoryIdByHash(hash);
    if (id === undefined) {
      throw new Error('Failed to resolve memory id');
    }
    insertTags(id, normalizedTags);
    return { id, hash, isNew: toSafeInteger(result.changes, 'changes') === 1 };
  });
