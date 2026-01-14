import type { RecallResult, SearchResult } from '../types.js';
import {
  db,
  type DbRow,
  executeAll,
  loadTagsForMemoryIds,
  mapRowToRelationship,
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

const toSearchError = (err: unknown): Error | undefined => {
  const message = getErrorMessage(err);
  if (isSearchIndexMissing(message)) {
    return new Error(
      'Search index unavailable. Ensure FTS5 is enabled and the index is ' +
        'initialized.'
    );
  }
  if (isSearchQueryInvalid(message)) {
    return new Error(
      'Invalid search query syntax. Check for unbalanced quotes or special ' +
        'characters. ' +
        `Details: ${message}`
    );
  }
  return undefined;
};

const executeSearch = (sql: string, params: (number | string)[]): DbRow[] => {
  try {
    const stmt = prepareCached(sql);
    return executeAll(stmt, ...params);
  } catch (err) {
    throw toSearchError(err) ?? err;
  }
};

interface SearchInput {
  query: string;
}

const mapRowsToSearchResultsWithTags = (rows: DbRow[]): SearchResult[] => {
  const ids = rows.map((row) => toSafeInteger(row.id, 'id'));
  const tagsById = loadTagsForMemoryIds(ids);
  return rows.map((row) => {
    const id = toSafeInteger(row.id, 'id');
    return mapRowToSearchResult(row, tagsById.get(id) ?? []);
  });
};

export const searchMemories = (input: SearchInput): SearchResult[] => {
  const tokens = tokenizeQuery(input.query);
  if (tokens.length === 0) {
    throw new Error('Query cannot be empty');
  }
  const { sql, params } = buildSearchQuery(tokens);
  const rows = executeSearch(sql, params);
  return mapRowsToSearchResultsWithTags(rows);
};

const MAX_RECALL_DEPTH = 3;
const MAX_RECALL_MEMORIES = 50;

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
    ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id
  `;

  return { sql };
};

const executeWithSql = (
  sql: string,
  params: readonly (number | string)[]
): DbRow[] => {
  const stmt = db.prepare(sql);
  return executeAll(stmt, ...params);
};

const executeRecall = (seedIds: readonly number[], depth: number): DbRow[] => {
  const { sql } = buildRecallQuery(seedIds.length, depth);
  return executeWithSql(sql, seedIds);
};

const loadRelationshipsForMemoryIds = (
  memoryIds: readonly number[]
): RecallResult['relationships'] => {
  const { sql } = buildRelationshipsQuery(memoryIds.length);
  const rows = executeWithSql(sql, [...memoryIds, ...memoryIds]);
  return rows.map(mapRowToRelationship);
};

const getRecallDepth = (depth: number | undefined): number => depth ?? 1;

const emptyRecallResult = (depth: number): RecallResult => ({
  memories: [],
  relationships: [],
  depth,
});

const recallAtDepthZero = (
  searchResults: SearchResult[],
  depth: number
): RecallResult | undefined => {
  if (depth !== 0) return undefined;
  return { memories: searchResults, relationships: [], depth };
};

const recallAtPositiveDepth = (
  searchResults: SearchResult[],
  depth: number
): RecallResult => {
  const seedIds = searchResults.map((m) => m.id);
  const recallRows = executeRecall(seedIds, depth);
  const memories = mapRowsToSearchResultsWithTags(recallRows);
  if (memories.length === 0) {
    return emptyRecallResult(depth);
  }

  const relationships = loadRelationshipsForMemoryIds(
    memories.map((m) => m.id)
  );
  return { memories, relationships, depth };
};

export const recallMemories = (input: {
  query: string;
  depth?: number;
}): RecallResult => {
  const searchResults = searchMemories({ query: input.query });
  if (searchResults.length === 0) {
    return emptyRecallResult(getRecallDepth(input.depth));
  }

  const depth = getRecallDepth(input.depth);

  const depthZeroResult = recallAtDepthZero(searchResults, depth);
  if (depthZeroResult) {
    return depthZeroResult;
  }

  return recallAtPositiveDepth(searchResults, depth);
};
