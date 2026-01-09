import type { DbRow } from './row-mappers.js';
import { toSearchError } from './search-errors.js';
import { executeAll, prepareCached } from './sqlite.js';

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

export const buildSearchQuery = (input: {
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

export const executeSearch = (
  sql: string,
  params: (number | string)[]
): DbRow[] => {
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
