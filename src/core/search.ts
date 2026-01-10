import type { SearchResult } from '../types.js';
import {
  type DbRow,
  executeAll,
  mapRowToSearchResult,
  prepareCached,
} from './db.js';
import { normalizeTags } from './memory-write.js';

const MAX_QUERY_TOKENS = 50;

const tokenizeQuery = (query: string): string => {
  const parts = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (parts.length === 0) return '""';
  if (parts.length > MAX_QUERY_TOKENS) {
    throw new Error(`Query has too many terms (max ${MAX_QUERY_TOKENS})`);
  }

  const tokens: string[] = [];
  for (const part of parts) {
    tokens.push(`"${part.replace(/"/g, '""')}"`);
  }
  return tokens.join(' OR ');
};

const buildTagFilter = (
  tags: readonly string[]
): { clause: string; params: string[] } => {
  if (tags.length === 0) return { clause: '', params: [] };
  const placeholders = tags.map(() => '?').join(', ');
  return {
    clause: ` AND m.id IN (SELECT memory_id FROM tags WHERE tag IN (${placeholders}))`,
    params: [...tags],
  };
};

const buildSearchQuery = (input: {
  query: string;
  limit: number;
  tags: readonly string[];
}): { sql: string; params: (number | string)[] } => {
  const sanitizedQuery = tokenizeQuery(input.query);
  const tagFilter = buildTagFilter(input.tags);
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';
  const sql = `
    SELECT m.*, ${relevanceExpr} as relevance
    FROM memories m
    JOIN memories_fts ON m.id = memories_fts.rowid
    WHERE memories_fts MATCH ?${tagFilter.clause}
    ORDER BY relevance DESC
    LIMIT ?
  `;
  return { sql, params: [sanitizedQuery, ...tagFilter.params, input.limit] };
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
  limit?: number | undefined;
  tags?: readonly string[] | undefined;
}

export const searchMemories = (input: SearchInput): SearchResult[] => {
  const searchInput = {
    query: input.query,
    limit: input.limit ?? 10,
    tags: normalizeTags(input.tags ?? [], 50),
  };
  const { sql, params } = buildSearchQuery(searchInput);
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};
