import type { RelatedMemory } from '../types/index.js';
import { db } from './database.js';
import { type DbRow, mapRowToRelatedMemory } from './row-mappers.js';

type SqlParam = string | number | bigint | null | Uint8Array;

const executeAll = (sql: string, ...params: SqlParam[]): DbRow[] =>
  db.prepare(sql).all(...params) as DbRow[];

const mapRows = (rows: DbRow[]): RelatedMemory[] =>
  rows.map((row) => mapRowToRelatedMemory(row));

const buildTypeClause = (relationType?: string): string =>
  relationType ? ' AND r.relation_type = ?' : '';

const buildTypeParams = (relationType?: string): string[] =>
  relationType ? [relationType] : [];

export const queryOutgoingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.to_memory_id
    WHERE r.from_memory_id = ?${buildTypeClause(relationType)}
    LIMIT 1000
  `;
  return mapRows(executeAll(sql, memoryId, ...buildTypeParams(relationType)));
};

export const queryIncomingDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.from_memory_id
    WHERE r.to_memory_id = ?${buildTypeClause(relationType)}
    LIMIT 1000
  `;
  return mapRows(executeAll(sql, memoryId, ...buildTypeParams(relationType)));
};

export const queryBothDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const typeClause = buildTypeClause(relationType);
  const typeParams = buildTypeParams(relationType);
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.to_memory_id
    WHERE r.from_memory_id = ?${typeClause}
    UNION
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.from_memory_id
    WHERE r.to_memory_id = ?${typeClause}
    LIMIT 1000
  `;
  return mapRows(
    executeAll(sql, memoryId, ...typeParams, memoryId, ...typeParams)
  );
};

export const queryOutgoingRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const typeClause = buildTypeClause(relationType);
  const sql = `
    WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
      SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      WHERE r.from_memory_id = ?${typeClause}
      UNION ALL
      SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      JOIN rels ON r.from_memory_id = rels.to_id
      WHERE rels.depth < ?${typeClause}
    )
    SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
    FROM rels
    JOIN memories m ON m.id = rels.to_id
    GROUP BY m.id, rels.relation_type
    ORDER BY depth, m.id
    LIMIT 1000
  `;
  const params: (number | string)[] = relationType
    ? [memoryId, relationType, maxDepth, relationType]
    : [memoryId, maxDepth];
  return mapRows(executeAll(sql, ...params));
};

export const queryIncomingRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const typeClause = buildTypeClause(relationType);
  const sql = `
    WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
      SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      WHERE r.to_memory_id = ?${typeClause}
      UNION ALL
      SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
      FROM relationships r
      JOIN rels ON r.to_memory_id = rels.from_id
      WHERE rels.depth < ?${typeClause}
    )
    SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
    FROM rels
    JOIN memories m ON m.id = rels.from_id
    GROUP BY m.id, rels.relation_type
    ORDER BY depth, m.id
    LIMIT 1000
  `;
  const params: (number | string)[] = relationType
    ? [memoryId, relationType, maxDepth, relationType]
    : [memoryId, maxDepth];
  return mapRows(executeAll(sql, ...params));
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
