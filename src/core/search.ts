import type { RecallResult, SearchResult } from '../types.js';
import {
  type DbRow,
  executeAll,
  loadTagsForMemoryIds,
  mapRowToRelationship,
  mapRowToSearchResult,
  prepareCached,
  sqlAll,
  toSafeInteger,
} from './db.js';

const MAX_QUERY_TOKENS = 50;
const DEFAULT_LIMIT = 100;

const MAX_RECALL_DEPTH = 3;
const MAX_RECALL_MEMORIES = 50;

const RECENCY_DECAY_DAYS = 7;
const RECENCY_WEIGHT = 0.15;

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal && typeof signal.throwIfAborted === 'function') {
    signal.throwIfAborted();
  }
};

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

const escapeFtsToken = (token: string): string =>
  `"${token.replace(/"/g, '""')}"`;

const buildFtsQuery = (tokens: string[]): string =>
  tokens.length === 0 ? '""' : tokens.map(escapeFtsToken).join(' OR ');

const buildSearchQuery = (
  tokens: string[]
): { sql: string; params: (number | string)[] } => {
  const ftsQuery = buildFtsQuery(tokens);
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';

  const recencyBoost = `MAX(0.0, (${RECENCY_DECAY_DAYS}.0 - julianday('now') + julianday(created_at)) / ${RECENCY_DECAY_DAYS}.0) * ${RECENCY_WEIGHT}`;

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
      WHERE t.tag IN (SELECT value FROM json_each(?))
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

  return { sql, params: [ftsQuery, JSON.stringify(tokens), DEFAULT_LIMIT] };
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
      'Search index unavailable. Ensure FTS5 is enabled and the index is initialized.'
    );
  }

  if (isSearchQueryInvalid(message)) {
    return new Error(
      'Invalid search query syntax. Check for unbalanced quotes or special characters. ' +
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

const enrichSearchResultsWithTags = (
  rows: DbRow[],
  signal?: AbortSignal
): SearchResult[] => {
  throwIfAborted(signal);

  const ids = rows.map((row) => toSafeInteger(row.id, 'id'));
  const tagsById = loadTagsForMemoryIds(ids);

  return rows.map((row) => {
    const id = toSafeInteger(row.id, 'id');
    return mapRowToSearchResult(row, tagsById.get(id) ?? []);
  });
};

export const searchMemories = (
  input: SearchInput,
  signal?: AbortSignal
): SearchResult[] => {
  throwIfAborted(signal);

  const tokens = tokenizeQuery(input.query);
  if (tokens.length === 0) throw new Error('Query cannot be empty');

  const { sql, params } = buildSearchQuery(tokens);
  const rows = executeSearch(sql, params);

  throwIfAborted(signal);
  return enrichSearchResultsWithTags(rows, signal);
};

const normalizeRecallDepth = (depth: number | undefined): number => {
  const raw = depth ?? 1;
  if (!Number.isFinite(raw)) return 1;
  const asInt = Math.trunc(raw);
  return Math.min(Math.max(0, asInt), MAX_RECALL_DEPTH);
};

const executeRecall = (seedIds: readonly number[], depth: number): DbRow[] => {
  if (seedIds.length === 0) return [];

  return sqlAll`
    WITH RECURSIVE connected(memory_id, depth) AS (
      -- Seed memories from search results
      SELECT m.id, 0
      FROM memories m
      WHERE m.id IN (SELECT value FROM json_each(${JSON.stringify(seedIds)}))

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
      WHERE c.depth < ${depth}
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
};

const loadRelationshipsForMemoryIds = (
  memoryIds: readonly number[]
): RecallResult['relationships'] => {
  if (memoryIds.length === 0) return [];

  const rows = sqlAll`
    WITH ids(id) AS (SELECT value FROM json_each(${JSON.stringify(memoryIds)}))
    SELECT r.id, r.relation_type, r.created_at,
           mf.hash as from_hash, mt.hash as to_hash
    FROM relationships r
    JOIN ids a ON r.from_memory_id = a.id
    JOIN ids b ON r.to_memory_id = b.id
    JOIN memories mf ON r.from_memory_id = mf.id
    JOIN memories mt ON r.to_memory_id = mt.id
    ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id
  `;
  return rows.map(mapRowToRelationship);
};

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
  depth: number,
  signal?: AbortSignal
): RecallResult => {
  throwIfAborted(signal);

  const seedIds = searchResults.map((m) => m.id);
  const recallRows = executeRecall(seedIds, depth);

  throwIfAborted(signal);

  const memories = enrichSearchResultsWithTags(recallRows, signal);
  if (memories.length === 0) return emptyRecallResult(depth);

  throwIfAborted(signal);

  const relationships = loadRelationshipsForMemoryIds(
    memories.map((m) => m.id)
  );
  return { memories, relationships, depth };
};

export const recallMemories = (
  input: {
    query: string;
    depth?: number;
  },
  signal?: AbortSignal
): RecallResult => {
  throwIfAborted(signal);

  const depth = normalizeRecallDepth(input.depth);
  const searchResults = searchMemories({ query: input.query }, signal);

  if (searchResults.length === 0) {
    return emptyRecallResult(depth);
  }

  const depthZeroResult = recallAtDepthZero(searchResults, depth);
  if (depthZeroResult) return depthZeroResult;

  return recallAtPositiveDepth(searchResults, depth, signal);
};
