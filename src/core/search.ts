import { db } from './database.js';
import { executeAll } from './db-helpers.js';
import type { DbRow } from './row-mappers.js';
import { toSearchError } from './search-errors.js';

interface SearchQuery {
  sql: string;
  params: (number | string)[];
}

const tokenizeQuery = (query: string): string => {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return tokens.length > 0 ? tokens.join(' OR ') : '""';
};

export const buildSearchQuery = (
  query: string,
  limit: number,
  tags: readonly string[],
  minRelevance?: number,
  offset?: number
): SearchQuery => {
  const sanitizedQuery = tokenizeQuery(query);
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

  if (offset !== undefined && offset > 0) {
    sql += ' OFFSET ?';
    params.push(offset);
  }

  return { sql, params };
};

export const executeSearch = (
  sql: string,
  params: (number | string)[]
): DbRow[] => {
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
