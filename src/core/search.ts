import type { RecallResult, Relationship, SearchResult } from '../types.js';
import {
  db,
  type DbRow,
  executeAll,
  mapRowToSearchResult,
  prepareCached,
  toSafeInteger,
} from './db.js';

const MAX_QUERY_TOKENS = 50;
const DEFAULT_LIMIT = 100;
const RECENCY_DECAY_DAYS = 7;
const RECENCY_WEIGHT = 0.15;

const tokenizeQuery = (query: string): string[] => {
  const parts = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (parts.length === 0) return [];
  if (parts.length > MAX_QUERY_TOKENS) {
    throw new Error(`Query has too many terms (max ${MAX_QUERY_TOKENS})`);
  }
  return parts;
};

const buildFtsQuery = (tokens: string[]): string => {
  if (tokens.length === 0) return '""';
  const escaped = tokens.map((t) => `"${t.replace(/"/g, '""')}"`);
  return escaped.join(' OR ');
};

const buildTagPlaceholders = (count: number): string => {
  return Array.from({ length: count }, () => '?').join(', ');
};

const buildSearchQuery = (
  tokens: string[]
): { sql: string; params: (number | string)[] } => {
  const ftsQuery = buildFtsQuery(tokens);
  const tagPlaceholders = buildTagPlaceholders(tokens.length);
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';

  const recencyBoost = `MAX(0.0, (${RECENCY_DECAY_DAYS}.0 - julianday('now') + julianday(created_at)) / ${RECENCY_DECAY_DAYS}.0) * ${RECENCY_WEIGHT}`;

  // Union of FTS content matches and tag matches, deduplicated
  const sql = `
    WITH content_matches AS (
      SELECT m.*, ${relevanceExpr} as base_relevance, ${recencyBoost} as recency_bonus
      FROM memories m
      JOIN memories_fts ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH ?
    ),
    tag_matches AS (
      SELECT DISTINCT m.*, 0.5 as base_relevance, ${recencyBoost} as recency_bonus
      FROM memories m
      JOIN tags t ON m.id = t.memory_id
      WHERE t.tag IN (${tagPlaceholders})
    ),
    combined AS (
      SELECT *, (base_relevance + recency_bonus) as relevance FROM content_matches
      UNION ALL
      SELECT *, (base_relevance + recency_bonus) as relevance FROM tag_matches
    )
    SELECT id, content, summary, importance, memory_type, created_at, accessed_at, hash,
           MAX(relevance) as relevance
    FROM combined
    GROUP BY id
    ORDER BY relevance DESC
    LIMIT ?
  `;

  return { sql, params: [ftsQuery, ...tokens, DEFAULT_LIMIT] };
};

const INDEX_MISSING_TOKENS = [
  'no such module: fts5',
  'no such table: memories_fts',
];
const QUERY_INVALID_TOKENS = ['fts5', 'syntax error'];

const isSearchIndexMissing = (message: string): boolean =>
  INDEX_MISSING_TOKENS.some((token) => message.includes(token));

const isSearchQueryInvalid = (message: string): boolean =>
  QUERY_INVALID_TOKENS.some((token) => message.includes(token));

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const SEARCH_ERROR_MAP: {
  matches: (message: string) => boolean;
  build: (message: string) => Error;
}[] = [
  {
    matches: isSearchIndexMissing,
    build: () =>
      new Error(
        'Search index unavailable. Ensure FTS5 is enabled and the index is ' +
          'initialized.'
      ),
  },
  {
    matches: isSearchQueryInvalid,
    build: (message) =>
      new Error(
        'Invalid search query syntax. Check for unbalanced quotes or special ' +
          'characters. ' +
          `Details: ${message}`
      ),
  },
];

const toSearchError = (err: unknown): Error | undefined => {
  const message = getErrorMessage(err);
  for (const mapping of SEARCH_ERROR_MAP) {
    if (mapping.matches(message)) {
      return mapping.build(message);
    }
  }
  return undefined;
};

const executeSearch = (sql: string, params: (number | string)[]): DbRow[] => {
  try {
    const stmt = prepareCached(sql);
    return executeAll(stmt, ...params);
  } catch (err) {
    const mappedError = toSearchError(err);
    if (mappedError) {
      throw mappedError;
    }
    throw err;
  }
};

interface SearchInput {
  query: string;
}

export const searchMemories = (input: SearchInput): SearchResult[] => {
  const tokens = tokenizeQuery(input.query);
  if (tokens.length === 0) {
    throw new Error('Query cannot be empty');
  }
  const { sql, params } = buildSearchQuery(tokens);
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};

const MAX_RECALL_DEPTH = 3;
const MAX_RECALL_MEMORIES = 50;

const toString = (value: unknown, field: string): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Invalid ${field}`);
};

const mapRowToRelationship = (row: DbRow): Relationship => ({
  id: toSafeInteger(row.id, 'id'),
  from_hash: toString(row.from_hash, 'from_hash'),
  to_hash: toString(row.to_hash, 'to_hash'),
  relation_type: toString(row.relation_type, 'relation_type'),
  created_at: toString(row.created_at, 'created_at'),
});

const buildRecallQuery = (
  seedCount: number,
  depth: number
): { sql: string } => {
  const seedPlaceholders = Array.from({ length: seedCount }, () => '?').join(
    ', '
  );
  const safeDepth = Math.min(Math.max(0, depth), MAX_RECALL_DEPTH);

  const sql = `
    WITH RECURSIVE connected(memory_id, depth) AS (
      -- Seed memories from search results
      SELECT id, 0 FROM memories WHERE id IN (${seedPlaceholders})
      UNION
      -- Follow relationships (both directions) up to max depth
      SELECT 
        CASE 
          WHEN r.from_memory_id = c.memory_id THEN r.to_memory_id
          ELSE r.from_memory_id
        END,
        c.depth + 1
      FROM relationships r
      JOIN connected c ON (r.from_memory_id = c.memory_id OR r.to_memory_id = c.memory_id)
      WHERE c.depth < ${safeDepth}
    ),
    unique_memories AS (
      SELECT DISTINCT memory_id, MIN(depth) as min_depth
      FROM connected
      GROUP BY memory_id
      ORDER BY min_depth
      LIMIT ${MAX_RECALL_MEMORIES}
    )
    SELECT m.*, 1.0 / (1.0 + um.min_depth) as relevance
    FROM memories m
    JOIN unique_memories um ON m.id = um.memory_id
    ORDER BY um.min_depth, m.created_at DESC
  `;

  return { sql };
};

const buildRelationshipsQuery = (memoryCount: number): { sql: string } => {
  const placeholders = Array.from({ length: memoryCount }, () => '?').join(
    ', '
  );

  const sql = `
    SELECT r.id, r.relation_type, r.created_at,
           mf.hash as from_hash, mt.hash as to_hash
    FROM relationships r
    JOIN memories mf ON r.from_memory_id = mf.id
    JOIN memories mt ON r.to_memory_id = mt.id
    WHERE r.from_memory_id IN (${placeholders})
      AND r.to_memory_id IN (${placeholders})
  `;

  return { sql };
};

export interface RecallInput {
  query: string;
  depth?: number;
}

export const recallMemories = (input: RecallInput): RecallResult => {
  const depth = input.depth ?? 1;

  const searchResults = searchMemories({ query: input.query });
  if (searchResults.length === 0) {
    return { memories: [], relationships: [], depth };
  }

  if (depth === 0) {
    return { memories: searchResults, relationships: [], depth };
  }

  const seedIds = searchResults.map((m) => m.id);

  const { sql: recallSql } = buildRecallQuery(seedIds.length, depth);
  const recallStmt = db.prepare(recallSql);
  const recallRows = executeAll(recallStmt, ...seedIds);
  const memories = recallRows.map(mapRowToSearchResult);

  const allMemoryIds = memories.map((m) => m.id);
  if (allMemoryIds.length === 0) {
    return { memories: [], relationships: [], depth };
  }

  const { sql: relSql } = buildRelationshipsQuery(allMemoryIds.length);
  const relStmt = db.prepare(relSql);
  const relRows = executeAll(relStmt, ...allMemoryIds, ...allMemoryIds);
  const relationships = relRows.map(mapRowToRelationship);

  return { memories, relationships, depth };
};
