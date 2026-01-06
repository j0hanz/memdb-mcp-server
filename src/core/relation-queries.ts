import type { RelatedMemory } from '../types/index.js';
import { db } from './database.js';
import type { SqlParam } from './db-helpers.js';
import { type DbRow, mapRowToRelatedMemory } from './row-mappers.js';

type Direction = 'outgoing' | 'incoming';

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
  (db.prepare(sql).all(...params) as DbRow[]).map((row) =>
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

export const queryOutgoingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildDirectSql({ direction: 'outgoing', clause });
  return run(sql, [memoryId, ...params]);
};

export const queryIncomingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = buildDirectSql({ direction: 'incoming', clause });
  return run(sql, [memoryId, ...params]);
};

export const queryBothDirect = (
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

export const queryOutgoingRecursive = (
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

export const queryIncomingRecursive = (
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

export const deduplicateByHash = (
  memories: RelatedMemory[]
): RelatedMemory[] => {
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
