import type { DatabaseSync } from 'node:sqlite';

import type { DbRow } from './memory-mappers.js';

export interface SearchQuery {
  sql: string;
  params: (number | string)[];
}

export const buildSearchQuery = (
  query: string,
  limit: number,
  tags: string[],
  minRelevance?: number
): SearchQuery => {
  const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';
  const whereParts: string[] = ['memories_fts MATCH ?'];
  const params: (number | string)[] = [query];

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

export const executeSearch = (
  db: DatabaseSync,
  sql: string,
  params: (number | string)[]
): DbRow[] => {
  const stmt = db.prepare(sql);

  try {
    return stmt.all(...params) as DbRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('no such module: fts5') ||
      message.includes('no such table: memories_fts')
    ) {
      throw new Error(
        'Search index unavailable. Ensure FTS5 is enabled and the index is initialized.'
      );
    }
    if (message.includes('fts5') || message.includes('syntax error')) {
      throw new Error(
        'Invalid search query syntax. Check for unbalanced quotes or special characters. ' +
          `Details: ${message}`
      );
    }
    throw err;
  }
};
