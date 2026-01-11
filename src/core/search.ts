import type { SearchResult } from '../types.js';
import {
  type DbRow,
  executeAll,
  mapRowToSearchResult,
  prepareCached,
} from './db.js';

const MAX_QUERY_TOKENS = 50;
const DEFAULT_LIMIT = 100;

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

// Search both content (FTS) and tags, deduplicated by memory id
const buildSearchQuery = (
  tokens: string[]
): { sql: string; params: (number | string)[] } => {
  const ftsQuery = buildFtsQuery(tokens);
  const tagPlaceholders = buildTagPlaceholders(tokens.length);
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';

  // Union of FTS content matches and tag matches, deduplicated
  const sql = `
    WITH content_matches AS (
      SELECT m.*, ${relevanceExpr} as relevance
      FROM memories m
      JOIN memories_fts ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH ?
    ),
    tag_matches AS (
      SELECT DISTINCT m.*, 0.5 as relevance
      FROM memories m
      JOIN tags t ON m.id = t.memory_id
      WHERE t.tag IN (${tagPlaceholders})
    ),
    combined AS (
      SELECT * FROM content_matches
      UNION ALL
      SELECT * FROM tag_matches
    )
    SELECT id, content, summary, created_at, accessed_at, hash,
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
