import crypto from 'node:crypto';

import type { Memory, SearchResult } from '../types/index.js';
import { dbManager } from './database.js';

interface RelatedMemory extends Memory {
  relation_type: string;
  depth: number;
}

interface StatementResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

interface MemoryInsertResult {
  id: number;
  hash: string;
  isNew: boolean;
}

interface MemoryStats {
  memoryCount: number;
  relationshipCount: number;
}

export class MemoryService {
  private db = dbManager.getDb();

  createMemory(
    content: string,
    tags: string[] = [],
    importance = 0,
    memoryType = 'general'
  ): MemoryInsertResult {
    const hash = crypto.createHash('md5').update(content).digest('hex');

    // Check if exists
    const existing = this.db
      .prepare('SELECT id FROM memories WHERE hash = ?')
      .get(hash) as { id: number } | undefined;
    if (existing) {
      return { id: existing.id, hash, isNew: false };
    }

    const insert = this.db.prepare(
      'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
    );

    const uniqueTags = tags.length > 0 ? [...new Set(tags)] : [];
    if (uniqueTags.length > 0) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = insert.run(content, importance, memoryType, hash);
        const memoryId = result.lastInsertRowid as number;
        const insertTag = this.db.prepare(
          'INSERT INTO tags (memory_id, tag) VALUES (?, ?)'
        );
        for (const tag of uniqueTags) {
          insertTag.run(memoryId, tag);
        }
        this.db.exec('COMMIT');
        return { id: memoryId, hash, isNew: true };
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    const result = insert.run(content, importance, memoryType, hash);
    const memoryId = result.lastInsertRowid as number;
    return { id: memoryId, hash, isNew: true };
  }

  searchMemories(
    query: string,
    limit = 10,
    tags: string[] = [],
    minRelevance?: number
  ): SearchResult[] {
    const uniqueTags = tags.length > 0 ? [...new Set(tags)] : [];
    const relevanceExpr = '1.0 / (1.0 + abs(bm25(memories_fts)))';
    const whereParts: string[] = ['memories_fts MATCH ?'];
    const params: (number | string)[] = [query];

    if (uniqueTags.length > 0) {
      whereParts.push(
        `m.id IN (SELECT memory_id FROM tags WHERE tag IN (${uniqueTags
          .map(() => '?')
          .join(', ')}))`
      );
      params.push(...uniqueTags);
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

    const stmt = this.db.prepare(sql);

    let rows: Record<string, unknown>[];
    try {
      rows = stmt.all(...params) as Record<string, unknown>[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('fts5') || message.includes('syntax error')) {
        throw new Error(
          `Invalid search query syntax. Check for unbalanced quotes or special characters. Details: ${message}`
        );
      }
      throw err;
    }

    return rows.map(
      (row): SearchResult => ({
        id: row.id as number,
        content: row.content as string,
        summary: row.summary as string | undefined,
        importance: row.importance as number,
        memory_type: row.memory_type as string,
        created_at: row.created_at as string,
        accessed_at: row.accessed_at as string,
        hash: row.hash as string,
        relevance: row.relevance as number | undefined,
      })
    );
  }

  getMemory(hash: string): Memory | undefined {
    return this.db
      .prepare('SELECT * FROM memories WHERE hash = ?')
      .get(hash) as Memory | undefined;
  }

  deleteMemory(hash: string): StatementResult {
    return this.db
      .prepare('DELETE FROM memories WHERE hash = ?')
      .run(hash) as StatementResult;
  }

  linkMemories(
    fromHash: string,
    toHash: string,
    relationType: string
  ): StatementResult {
    const from = this.getMemory(fromHash);
    const to = this.getMemory(toHash);

    if (!from || !to) {
      throw new Error('One or both memories not found');
    }

    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO relationships (from_memory_id, to_memory_id, relation_type) VALUES (?, ?, ?)'
    );
    return insert.run(from.id, to.id, relationType) as StatementResult;
  }

  getRelated(hash: string, relationType?: string, depth = 1): RelatedMemory[] {
    const memory = this.getMemory(hash);
    if (!memory) return [];

    const maxDepth = Math.max(1, depth);
    const baseFilter = relationType ? ' AND r.relation_type = ?' : '';
    const baseParams: (number | string)[] = [memory.id];
    if (relationType) {
      baseParams.push(relationType);
    }

    if (maxDepth === 1) {
      const sql = `
        SELECT m.*, r.relation_type as relation_type, 1 as depth
        FROM memories m
        JOIN relationships r ON m.id = r.to_memory_id
        WHERE r.from_memory_id = ?${baseFilter}
      `;
      const rows = this.db.prepare(sql).all(...baseParams) as Record<
        string,
        unknown
      >[];
      return rows.map(
        (row): RelatedMemory => ({
          id: row.id as number,
          content: row.content as string,
          summary: row.summary as string | undefined,
          importance: row.importance as number,
          memory_type: row.memory_type as string,
          created_at: row.created_at as string,
          accessed_at: row.accessed_at as string,
          hash: row.hash as string,
          relation_type: row.relation_type as string,
          depth: row.depth as number,
        })
      );
    }

    const sql = `
      WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
        SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
        FROM relationships r
        WHERE r.from_memory_id = ?${baseFilter}
        UNION ALL
        SELECT rels.depth + 1, r.from_memory_id, r.to_memory_id, r.relation_type
        FROM relationships r
        JOIN rels ON r.from_memory_id = rels.to_id
        WHERE rels.depth < ?${relationType ? ' AND r.relation_type = ?' : ''}
      )
      SELECT m.*, rels.relation_type as relation_type, MIN(rels.depth) as depth
      FROM rels
      JOIN memories m ON m.id = rels.to_id
      GROUP BY m.id, rels.relation_type
      ORDER BY depth, m.id
    `;
    const recursiveParams: (number | string)[] = [...baseParams, maxDepth];
    if (relationType) {
      recursiveParams.push(relationType);
    }
    const rows = this.db.prepare(sql).all(...recursiveParams) as Record<
      string,
      unknown
    >[];
    return rows.map(
      (row): RelatedMemory => ({
        id: row.id as number,
        content: row.content as string,
        summary: row.summary as string | undefined,
        importance: row.importance as number,
        memory_type: row.memory_type as string,
        created_at: row.created_at as string,
        accessed_at: row.accessed_at as string,
        hash: row.hash as string,
        relation_type: row.relation_type as string,
        depth: row.depth as number,
      })
    );
  }

  getStats(): MemoryStats {
    const memoryCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as {
        count: number;
      }
    ).count;
    const relationshipCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM relationships').get() as {
        count: number;
      }
    ).count;
    return { memoryCount, relationshipCount };
  }
}

export const memoryService = new MemoryService();
