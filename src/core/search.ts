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

const buildBaseSql = (whereClause: string): string => {
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';
  return `
    WITH ranked AS (
      SELECT m.*, ${relevanceExpr} as relevance
      FROM memories m
      JOIN memories_fts ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH ?${whereClause}
    )
    SELECT * FROM ranked
  `;
};

const appendMinRelevance = (input: {
  sql: string;
  params: (number | string)[];
  minRelevance?: number;
}): { sql: string; params: (number | string)[] } => {
  if (input.minRelevance === undefined) return input;
  return {
    sql: `${input.sql} WHERE relevance >= ?`,
    params: [...input.params, input.minRelevance],
  };
};

const appendPagination = (input: {
  sql: string;
  params: (number | string)[];
  limit: number;
  offset?: number;
}): { sql: string; params: (number | string)[] } => {
  const params = [...input.params, input.limit];
  let sql = `${input.sql} ORDER BY relevance DESC LIMIT ?`;
  if (input.offset !== undefined && input.offset > 0) {
    sql += ' OFFSET ?';
    params.push(input.offset);
  }
  return { sql, params };
};

const buildSearchQuery = (input: {
  query: string;
  limit: number;
  tags: readonly string[];
  minRelevance?: number;
  offset?: number;
}): { sql: string; params: (number | string)[] } => {
  const sanitizedQuery = tokenizeQuery(input.query);
  const tagFilter = buildTagFilter(input.tags);
  const baseSql = buildBaseSql(tagFilter.clause);
  const baseParams: (number | string)[] = [sanitizedQuery, ...tagFilter.params];
  const baseQuery = { sql: baseSql, params: baseParams };
  const withRelevance =
    input.minRelevance === undefined
      ? baseQuery
      : appendMinRelevance({
          ...baseQuery,
          minRelevance: input.minRelevance,
        });
  const paginatedQuery =
    input.offset === undefined
      ? { ...withRelevance, limit: input.limit }
      : { ...withRelevance, limit: input.limit, offset: input.offset };
  return appendPagination(paginatedQuery);
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
  minRelevance?: number | undefined;
  offset?: number | undefined;
}

const buildSearchInput = (
  input: SearchInput
): {
  query: string;
  limit: number;
  tags: readonly string[];
  minRelevance?: number;
  offset?: number;
} => {
  const result: {
    query: string;
    limit: number;
    tags: readonly string[];
    minRelevance?: number;
    offset?: number;
  } = {
    query: input.query,
    limit: input.limit ?? 10,
    tags: normalizeTags(input.tags ?? [], 50),
  };

  if (input.minRelevance !== undefined) {
    result.minRelevance = input.minRelevance;
  }
  if (input.offset !== undefined) {
    result.offset = input.offset;
  }
  return result;
};

export const searchMemories = (input: SearchInput): SearchResult[] => {
  const searchInput = buildSearchInput(input);
  const { sql, params } = buildSearchQuery(searchInput);
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};
