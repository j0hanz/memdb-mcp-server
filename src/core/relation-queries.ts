import type { RelatedMemory } from '../types/index.js';
import { db } from './database.js';
import type { SqlParam } from './db-helpers.js';
import { type DbRow, mapRowToRelatedMemory } from './row-mappers.js';

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

export const queryOutgoingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.to_memory_id
    WHERE r.from_memory_id = ?${clause}
    LIMIT 1000
  `;
  return run(sql, [memoryId, ...params]);
};

export const queryIncomingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.from_memory_id
    WHERE r.to_memory_id = ?${clause}
    LIMIT 1000
  `;
  return run(sql, [memoryId, ...params]);
};

export const queryBothDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.to_memory_id
    WHERE r.from_memory_id = ?${clause}
    UNION
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.from_memory_id
    WHERE r.to_memory_id = ?${clause}
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
  const sql = `
    WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
      SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      WHERE r.from_memory_id = ?${clause}
      UNION ALL
      SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      JOIN rels ON r.from_memory_id = rels.to_id
      WHERE rels.depth < ?${clause}
    )
    SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
    FROM rels
    JOIN memories m ON m.id = rels.to_id
    GROUP BY m.id, rels.relation_type
    ORDER BY depth, m.id
    LIMIT 1000
  `;
  const sqlParams: (number | string)[] = relationType
    ? [memoryId, ...params, maxDepth, ...params]
    : [memoryId, maxDepth];
  return run(sql, sqlParams);
};

export const queryIncomingRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const { clause, params } = typeFilter(relationType);
  const sql = `
    WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
      SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      WHERE r.to_memory_id = ?${clause}
      UNION ALL
      SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      JOIN rels ON r.to_memory_id = rels.from_id
      WHERE rels.depth < ?${clause}
    )
    SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
    FROM rels
    JOIN memories m ON m.id = rels.from_id
    GROUP BY m.id, rels.relation_type
    ORDER BY depth, m.id
    LIMIT 1000
  `;
  const sqlParams: (number | string)[] = relationType
    ? [memoryId, ...params, maxDepth, ...params]
    : [memoryId, maxDepth];
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
