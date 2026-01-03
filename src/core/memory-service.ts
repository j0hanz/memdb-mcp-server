import crypto from 'node:crypto';
import type { StatementSync } from 'node:sqlite';

import type {
  Memory,
  MemoryInsertResult,
  MemoryStats,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from '../types/index.js';
import { db } from './database.js';
import {
  type DbRow,
  mapRowToMemory,
  mapRowToRelatedMemory,
  mapRowToSearchResult,
  toSafeInteger,
} from './row-mappers.js';
import { toSearchError } from './search-errors.js';

type SqlParam = string | number | bigint | null | Uint8Array;

interface RunResult {
  changes: number | bigint;
}

interface SearchQuery {
  sql: string;
  params: (number | string)[];
}

const executeAll = (stmt: StatementSync, ...params: unknown[]): DbRow[] =>
  stmt.all(...(params as SqlParam[])) as DbRow[];

const executeGet = (
  stmt: StatementSync,
  ...params: unknown[]
): DbRow | undefined =>
  stmt.get(...(params as SqlParam[])) as DbRow | undefined;

const executeRun = (stmt: StatementSync, ...params: unknown[]): RunResult =>
  stmt.run(...(params as SqlParam[])) as RunResult;

const sanitizeFts5Query = (query: string): string => {
  const escaped = query.replace(/"/g, '""');
  return `"${escaped}"`;
};

const buildSearchQuery = (
  query: string,
  limit: number,
  tags: readonly string[],
  minRelevance?: number
): SearchQuery => {
  const sanitizedQuery = sanitizeFts5Query(query);
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';
  const whereParts: string[] = ['memories_fts MATCH ?'];
  const params: (number | string)[] = [sanitizedQuery];

  if (tags.length > 0) {
    whereParts.push(
      `m.id IN (SELECT memory_id FROM tags WHERE tag IN (${tags
        .map(() => '?')
        .join(', ')}))`
    );
    params.push(...tags);
  }

  let sql = `
    WITH ranked AS (
      SELECT m.*, ${relevanceExpr} as relevance
      FROM memories m
      JOIN memories_fts fts ON m.id = fts.rowid
      WHERE ${whereParts.join(' AND ')}
    )
    SELECT * FROM ranked
  `;

  if (minRelevance !== undefined) {
    sql += ' WHERE relevance >= ?';
    params.push(minRelevance);
  }

  sql += ' ORDER BY relevance DESC LIMIT ?';
  params.push(limit);

  return { sql, params };
};

const executeSearch = (sql: string, params: (number | string)[]): DbRow[] => {
  try {
    const stmt = db.prepare(sql);
    return executeAll(stmt, ...params);
  } catch (err) {
    const mappedError = toSearchError(err);
    if (mappedError) {
      throw mappedError;
    }
    throw err;
  }
};

const buildHash = (content: string): string =>
  crypto.createHash('md5').update(content).digest('hex');

const assertValidTag = (tag: string): void => {
  if (tag.length === 0) {
    throw new Error('Tag must be at least 1 character');
  }
  if (tag.length > 50) {
    throw new Error('Tag exceeds 50 characters');
  }
};

const normalizeTags = (
  tags: readonly string[],
  maxTags: number
): readonly string[] => {
  if (tags.length === 0) return [];
  if (tags.length > maxTags) {
    throw new Error('Too many tags (max ' + String(maxTags) + ')');
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    assertValidTag(tag);
    seen.add(tag);
  }
  return [...seen];
};

const runInImmediateTransaction = <T>(operation: () => T): T => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = executeGet(
    db.prepare('SELECT id FROM memories WHERE hash = ?'),
    hash
  );
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

const requireMemoryId = (hash: string): number => {
  const id = findMemoryIdByHash(hash);
  if (id === undefined) {
    throw new Error('Failed to resolve memory id');
  }
  return id;
};

const insertTags = (memoryId: number, tags: readonly string[]): void => {
  if (tags.length === 0) return;
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO tags (memory_id, tag) VALUES (?, ?)'
  );
  for (const tag of tags) {
    executeRun(insertTag, memoryId, tag);
  }
};

const relationFilter = (
  relationType?: string
): { clause: string; params: string[] } => {
  if (!relationType) return { clause: '', params: [] };
  return { clause: ' AND r.relation_type = ?', params: [relationType] };
};

export const createMemory = (
  content: string,
  tags: readonly string[] = [],
  importance = 0,
  memoryType = 'general'
): MemoryInsertResult =>
  runInImmediateTransaction(() => {
    const hash = buildHash(content);
    const normalizedTags = normalizeTags(tags, 100);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO memories (content, importance, ' +
        'memory_type, hash) VALUES (?, ?, ?, ?)'
    );
    const result = executeRun(insert, content, importance, memoryType, hash);
    const id = requireMemoryId(hash);
    insertTags(id, normalizedTags);
    return { id, hash, isNew: toSafeInteger(result.changes, 'changes') === 1 };
  });

export const searchMemories = (
  query: string,
  limit = 10,
  tags: readonly string[] = [],
  minRelevance?: number
): SearchResult[] => {
  const { sql, params } = buildSearchQuery(
    query,
    limit,
    normalizeTags(tags, 50),
    minRelevance
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

export const getRelated = (
  hash: string,
  relationType?: string,
  depth = 1
): RelatedMemory[] => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) return [];

  const maxDepth = Math.max(1, depth);
  if (maxDepth === 1) {
    return getRelatedDirect(memoryId, relationType);
  }

  return getRelatedRecursive(memoryId, relationType, maxDepth);
};

export const getStats = (): MemoryStats => {
  const memoryRow = executeGet(
    db.prepare('SELECT COUNT(*) as count FROM memories')
  );
  const relationshipRow = executeGet(
    db.prepare('SELECT COUNT(*) as count FROM relationships')
  );
  if (!memoryRow || !relationshipRow) {
    throw new Error('Failed to load database stats');
  }
  return {
    memoryCount: toSafeInteger(memoryRow.count, 'memoryCount'),
    relationshipCount: toSafeInteger(
      relationshipRow.count,
      'relationshipCount'
    ),
  };
};

const getRelatedDirect = (
  memoryId: number,
  relationType?: string
): RelatedMemory[] => {
  const { clause, params } = relationFilter(relationType);
  const sql = `
    SELECT m.*, r.relation_type as relation_type, 1 as depth
    FROM memories m
    JOIN relationships r ON m.id = r.to_memory_id
    WHERE r.from_memory_id = ?${clause}
    LIMIT 1000
  `;
  const rows = executeAll(db.prepare(sql), memoryId, ...params);
  return rows.map((row) => mapRowToRelatedMemory(row));
};

const getRelatedRecursive = (
  memoryId: number,
  relationType: string | undefined,
  maxDepth: number
): RelatedMemory[] => {
  const { clause, params } = relationFilter(relationType);
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
  const baseParams: (number | string)[] = [memoryId, ...params, maxDepth];
  const recursiveParams =
    params.length > 0 ? [...baseParams, ...params] : baseParams;
  const rows = executeAll(db.prepare(sql), ...recursiveParams);
  return rows.map((row) => mapRowToRelatedMemory(row));
};
