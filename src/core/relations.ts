import type { RelatedMemory, StatementResult } from '../types.js';
import {
  db,
  type DbRow,
  executeAll,
  executeRun,
  mapRowToRelatedMemory,
  prepareCached,
  type SqlParam,
  toSafeInteger,
} from './db.js';
import { findMemoryIdByHash } from './memory-write.js';

type RelationDirection = 'outgoing' | 'incoming' | 'both';
type Direction = 'outgoing' | 'incoming';

const stmtInsertRelation = db.prepare(
  'INSERT OR IGNORE INTO relationships (from_memory_id, to_memory_id, ' +
    'relation_type) VALUES (?, ?, ?)'
);

const directConfig: Record<
  Direction,
  { joinColumn: 'to_memory_id' | 'from_memory_id'; whereColumn: string }
> = {
  outgoing: { joinColumn: 'to_memory_id', whereColumn: 'from_memory_id' },
  incoming: { joinColumn: 'from_memory_id', whereColumn: 'to_memory_id' },
};

const recursiveConfig: Record<
  Direction,
  {
    baseColumn: 'from_memory_id' | 'to_memory_id';
    joinColumn: 'from_memory_id' | 'to_memory_id';
    relsJoinColumn: 'to_id' | 'from_id';
    memoryJoinColumn: 'to_id' | 'from_id';
  }
> = {
  outgoing: {
    baseColumn: 'from_memory_id',
    joinColumn: 'from_memory_id',
    relsJoinColumn: 'to_id',
    memoryJoinColumn: 'to_id',
  },
  incoming: {
    baseColumn: 'to_memory_id',
    joinColumn: 'to_memory_id',
    relsJoinColumn: 'from_id',
    memoryJoinColumn: 'from_id',
  },
};

const typeFilter = (
  relationType?: string
): { clause: string; params: string[] } =>
  relationType
    ? { clause: ' AND r.relation_type = ?', params: [relationType] }
    : { clause: '', params: [] };

const run = (sql: string, params: SqlParam[]): RelatedMemory[] =>
  executeAll(prepareCached(sql), ...params).map((row: DbRow) =>
    mapRowToRelatedMemory(row)
  );

const buildDirectSql = (input: {
  direction: Direction;
  clause: string;
  includeLimit?: boolean;
}): string => {
  const config = directConfig[input.direction];
  const limitClause = input.includeLimit === false ? '' : '\n    LIMIT 1000';
  return `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.${config.joinColumn}
    WHERE r.${config.whereColumn} = ?${input.clause}${limitClause}
  `;
};

const buildRecursiveSql = (input: {
  direction: Direction;
  clause: string;
}): string => {
  const config = recursiveConfig[input.direction];
  return `
    WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
      SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      WHERE r.${config.baseColumn} = ?${input.clause}
      UNION ALL
      SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      JOIN rels ON r.${config.joinColumn} = rels.${config.relsJoinColumn}
      WHERE rels.depth < ?${input.clause}
    )
    SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
    FROM rels
    JOIN memories m ON m.id = rels.${config.memoryJoinColumn}
    GROUP BY m.id, rels.relation_type
    ORDER BY depth, m.id
    LIMIT 1000
  `;
};

const buildRecursiveParams = (input: {
  memoryId: number;
  relationType: string | undefined;
  maxDepth: number;
  params: string[];
}): (number | string)[] => {
  if (!input.relationType) {
    return [input.memoryId, input.maxDepth];
  }
  return [input.memoryId, ...input.params, input.maxDepth, ...input.params];
};

const queryOutgoingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildDirectSql({ direction: 'outgoing', clause });
  return run(sql, [memoryId, ...params]);
};

const queryIncomingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildDirectSql({ direction: 'incoming', clause });
  return run(sql, [memoryId, ...params]);
};

const queryBothDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const outgoingSql = buildDirectSql({
    direction: 'outgoing',
    clause,
    includeLimit: false,
  });
  const incomingSql = buildDirectSql({
    direction: 'incoming',
    clause,
    includeLimit: false,
  });
  const sql = `
    ${outgoingSql}
    UNION
    ${incomingSql}
    LIMIT 1000
  `;
  return run(sql, [memoryId, ...params, memoryId, ...params]);
};

const queryOutgoingRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildRecursiveSql({ direction: 'outgoing', clause });
  const sqlParams = buildRecursiveParams({
    memoryId,
    relationType,
    maxDepth,
    params,
  });
  return run(sql, sqlParams);
};

const queryIncomingRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildRecursiveSql({ direction: 'incoming', clause });
  const sqlParams = buildRecursiveParams({
    memoryId,
    relationType,
    maxDepth,
    params,
  });
  return run(sql, sqlParams);
};

const deduplicateByHash = (memories: RelatedMemory[]): RelatedMemory[] => {
  const seen = new Map<string, RelatedMemory>();
  for (const mem of memories) {
    const existing = seen.get(mem.hash);
    if (!existing || mem.depth < existing.depth) {
      seen.set(mem.hash, mem);
    }
  }
  return [...seen.values()]
    .sort((a, b) => a.depth - b.depth || a.id - b.id)
    .slice(0, 1000);
};

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

  const result = executeRun(stmtInsertRelation, fromId, toId, relationType);
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
