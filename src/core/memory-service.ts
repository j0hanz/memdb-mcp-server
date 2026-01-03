import crypto from 'node:crypto';

import type {
  Memory,
  MemoryInsertResult,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from '../types/index.js';
import { db } from './database.js';
import {
  executeGet,
  executeRun,
  withImmediateTransaction,
} from './db-helpers.js';
import { findMemoryIdByHash, insertTags } from './memory-helpers.js';
import {
  deduplicateByHash,
  queryBothDirect,
  queryIncomingDirect,
  queryIncomingRecursive,
  queryOutgoingDirect,
  queryOutgoingRecursive,
} from './relation-queries.js';
import {
  mapRowToMemory,
  mapRowToSearchResult,
  toSafeInteger,
} from './row-mappers.js';
import { buildSearchQuery, executeSearch } from './search.js';
import { normalizeTags } from './tag-helpers.js';

const buildHash = (content: string): string =>
  crypto.createHash('md5').update(content).digest('hex');

export const createMemory = (
  content: string,
  tags: readonly string[] = [],
  importance = 0,
  memoryType = 'general'
): MemoryInsertResult =>
  withImmediateTransaction(() => {
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

export const searchMemories = (
  query: string,
  limit = 10,
  tags: readonly string[] = [],
  minRelevance?: number,
  offset?: number
): SearchResult[] => {
  const { sql, params } = buildSearchQuery(
    query,
    limit,
    normalizeTags(tags, 50),
    minRelevance,
    offset
  );
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};

export const getMemory = (hash: string): Memory | undefined => {
  const row = executeGet(
    db.prepare('SELECT * FROM memories WHERE hash = ?'),
    hash
  );
  return row ? mapRowToMemory(row) : undefined;
};

export const deleteMemory = (hash: string): StatementResult => {
  const result = executeRun(
    db.prepare('DELETE FROM memories WHERE hash = ?'),
    hash
  );
  return { changes: toSafeInteger(result.changes, 'changes') };
};

export const linkMemories = (
  fromHash: string,
  toHash: string,
  relationType: string
): StatementResult => {
  const fromId = findMemoryIdByHash(fromHash);
  const toId = findMemoryIdByHash(toHash);

  if (fromId === undefined || toId === undefined) {
    throw new Error('One or both memories not found');
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO relationships (from_memory_id, to_memory_id, ' +
      'relation_type) VALUES (?, ?, ?)'
  );
  const result = executeRun(insert, fromId, toId, relationType);
  return { changes: toSafeInteger(result.changes, 'changes') };
};

type RelationDirection = 'outgoing' | 'incoming' | 'both';

const calcMaxDepth = (depth: number, direction: RelationDirection): number =>
  direction === 'both' ? Math.min(depth, 2) : Math.max(1, depth);

export const getRelated = (
  hash: string,
  relationType?: string,
  depth = 1,
  direction: RelationDirection = 'outgoing'
): RelatedMemory[] => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) return [];

  const maxDepth = calcMaxDepth(depth, direction);
  if (maxDepth === 1) {
    return getRelatedDirect(memoryId, relationType, direction);
  }
  return getRelatedRecursive(memoryId, relationType, maxDepth, direction);
};

// Re-export getStats from memory-stats module
export { getStats } from './memory-stats.js';

// Re-export updateMemory from memory-updates module
export { updateMemory } from './memory-updates.js';

const getRelatedDirect = (
  memoryId: number,
  relationType?: string,
  direction: RelationDirection = 'outgoing'
): RelatedMemory[] => {
  if (direction === 'outgoing')
    return queryOutgoingDirect(memoryId, relationType);
  if (direction === 'incoming')
    return queryIncomingDirect(memoryId, relationType);
  return queryBothDirect(memoryId, relationType);
};

const getRelatedRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number,
  direction: RelationDirection = 'outgoing'
): RelatedMemory[] => {
  if (direction === 'outgoing') {
    return queryOutgoingRecursive(memoryId, relationType, maxDepth);
  }
  if (direction === 'incoming') {
    return queryIncomingRecursive(memoryId, relationType, maxDepth);
  }
  // direction === 'both'
  const outgoing = queryOutgoingRecursive(memoryId, relationType, maxDepth);
  const incoming = queryIncomingRecursive(memoryId, relationType, maxDepth);
  return deduplicateByHash([...outgoing, ...incoming]);
};
