import type { RelatedMemory, StatementResult } from '../types/index.js';
import { db } from './database.js';
import { executeRun } from './db-helpers.js';
import { findMemoryIdByHash } from './memory-helpers.js';
import {
  deduplicateByHash,
  queryBothDirect,
  queryIncomingDirect,
  queryIncomingRecursive,
  queryOutgoingDirect,
  queryOutgoingRecursive,
} from './relation-queries.js';
import { toSafeInteger } from './row-mappers.js';

type RelationDirection = 'outgoing' | 'incoming' | 'both';

const resolveMaxDepth = (
  depth: number,
  direction: RelationDirection
): number => {
  if (direction === 'both') {
    return Math.min(depth, 2);
  }
  return Math.max(1, depth);
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

export const getRelated = (input: {
  hash: string;
  relationType?: string;
  depth?: number;
  direction?: RelationDirection;
}): RelatedMemory[] => {
  const { hash, relationType, depth = 1, direction = 'outgoing' } = input;
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) return [];

  const maxDepth = resolveMaxDepth(depth, direction);
  if (maxDepth === 1) {
    return getRelatedDirect(memoryId, relationType, direction);
  }
  return getRelatedRecursive({
    memoryId,
    relationType,
    maxDepth,
    direction,
  });
};

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

const getRelatedRecursive = (input: {
  memoryId: number;
  relationType: string | undefined;
  maxDepth: number;
  direction: RelationDirection;
}): RelatedMemory[] => {
  const { memoryId, relationType, maxDepth, direction } = input;
  if (direction === 'outgoing') {
    return queryOutgoingRecursive(memoryId, relationType, maxDepth);
  }
  if (direction === 'incoming') {
    return queryIncomingRecursive(memoryId, relationType, maxDepth);
  }
  const outgoing = queryOutgoingRecursive(memoryId, relationType, maxDepth);
  const incoming = queryIncomingRecursive(memoryId, relationType, maxDepth);
  return deduplicateByHash([...outgoing, ...incoming]);
};
