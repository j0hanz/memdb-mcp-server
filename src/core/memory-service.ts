import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { Memory, SearchResult } from '../types/index.js';
import { dbManager } from './database.js';
import type { DbRow } from './memory-mappers.js';
import {
  mapRowToMemory,
  mapRowToRelatedMemory,
  mapRowToSearchResult,
  toSafeInteger,
} from './memory-mappers.js';
import { buildSearchQuery, executeSearch } from './memory-search.js';
import type {
  MemoryInsertResult,
  MemoryStats,
  RelatedMemory,
  StatementResult,
} from './memory-types.js';

interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export class MemoryService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync = dbManager.getDb()) {
    this.db = db;
  }

  createMemory(
    content: string,
    tags: string[] = [],
    importance = 0,
    memoryType = 'general'
  ): MemoryInsertResult {
    const hash = this.buildHash(content);
    const uniqueTags = this.normalizeTags(tags);

    return this.withImmediateTransaction(() => {
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      );
      const result = insert.run(
        content,
        importance,
        memoryType,
        hash
      ) as RunResult;
      const changes = this.normalizeChanges(result.changes);
      const id = this.findMemoryIdByHash(hash);
      if (id === undefined) {
        throw new Error('Failed to resolve memory id');
      }
      if (uniqueTags.length > 0) {
        this.insertTags(id, uniqueTags, true);
      }
      return { id, hash, isNew: changes === 1 };
    });
  }

  searchMemories(
    query: string,
    limit = 10,
    tags: string[] = [],
    minRelevance?: number
  ): SearchResult[] {
    const uniqueTags = this.normalizeTags(tags);
    const { sql, params } = buildSearchQuery(
      query,
      limit,
      uniqueTags,
      minRelevance
    );
    const rows = executeSearch(this.db, sql, params);
    return rows.map((row) => mapRowToSearchResult(row));
  }

  getMemory(hash: string): Memory | undefined {
    const row = this.db
      .prepare('SELECT * FROM memories WHERE hash = ?')
      .get(hash) as DbRow | undefined;
    return row ? mapRowToMemory(row) : undefined;
  }

  deleteMemory(hash: string): StatementResult {
    const result = this.db
      .prepare('DELETE FROM memories WHERE hash = ?')
      .run(hash) as RunResult;
    return { changes: this.normalizeChanges(result.changes) };
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
    const result = insert.run(from.id, to.id, relationType) as RunResult;
    return { changes: this.normalizeChanges(result.changes) };
  }

  getRelated(hash: string, relationType?: string, depth = 1): RelatedMemory[] {
    const memoryId = this.findMemoryIdByHash(hash);
    if (memoryId === undefined) return [];

    const maxDepth = this.normalizeDepth(depth);
    if (maxDepth === 1) {
      return this.getRelatedDirect(memoryId, relationType);
    }

    return this.getRelatedRecursive(memoryId, relationType, maxDepth);
  }

  getStats(): MemoryStats {
    const memoryRow = this.db
      .prepare('SELECT COUNT(*) as count FROM memories')
      .get() as DbRow | undefined;
    const relationshipRow = this.db
      .prepare('SELECT COUNT(*) as count FROM relationships')
      .get() as DbRow | undefined;
    if (!memoryRow || !relationshipRow) {
      throw new Error('Failed to load database stats');
    }
    const memoryCount = toSafeInteger(memoryRow.count, 'memoryCount');
    const relationshipCount = toSafeInteger(
      relationshipRow.count,
      'relationshipCount'
    );
    return { memoryCount, relationshipCount };
  }

  private buildHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private findMemoryIdByHash(hash: string): number | undefined {
    const row = this.db
      .prepare('SELECT id FROM memories WHERE hash = ?')
      .get(hash) as DbRow | undefined;
    if (!row) return undefined;
    return toSafeInteger(row.id, 'id');
  }

  private insertTags(
    memoryId: number,
    tags: string[],
    ignoreDuplicates = false
  ): void {
    const insertTag = this.db.prepare(
      ignoreDuplicates
        ? 'INSERT OR IGNORE INTO tags (memory_id, tag) VALUES (?, ?)'
        : 'INSERT INTO tags (memory_id, tag) VALUES (?, ?)'
    );
    for (const tag of tags) {
      insertTag.run(memoryId, tag);
    }
  }

  private normalizeTags(tags: string[]): string[] {
    return tags.length > 0 ? [...new Set(tags)] : [];
  }

  private withImmediateTransaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private normalizeDepth(depth: number): number {
    return Math.max(1, depth);
  }

  private normalizeChanges(value: number | bigint): number {
    return toSafeInteger(value, 'changes');
  }

  private buildRelationFilter(relationType?: string): {
    filter: string;
    params: (number | string)[];
  } {
    if (!relationType) {
      return { filter: '', params: [] };
    }
    return { filter: ' AND r.relation_type = ?', params: [relationType] };
  }

  private getRelatedDirect(
    memoryId: number,
    relationType?: string
  ): RelatedMemory[] {
    const { filter, params } = this.buildRelationFilter(relationType);
    const sql = `
      SELECT m.*, r.relation_type as relation_type, 1 as depth
      FROM memories m
      JOIN relationships r ON m.id = r.to_memory_id
      WHERE r.from_memory_id = ?${filter}
    `;
    const rows = this.db.prepare(sql).all(memoryId, ...params) as DbRow[];
    return rows.map((row) => mapRowToRelatedMemory(row));
  }

  private getRelatedRecursive(
    memoryId: number,
    relationType: string | undefined,
    maxDepth: number
  ): RelatedMemory[] {
    const { filter, params } = this.buildRelationFilter(relationType);
    const sql = `
      WITH RECURSIVE rels(depth, from_id, to_id, relation_type) AS (
        SELECT 1, r.from_memory_id, r.to_memory_id, r.relation_type
        FROM relationships r
        WHERE r.from_memory_id = ?${filter}
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
    const baseParams: (number | string)[] = [memoryId, ...params];
    const recursiveParams: (number | string)[] = [...baseParams, maxDepth];
    if (relationType) {
      recursiveParams.push(relationType);
    }
    const rows = this.db.prepare(sql).all(...recursiveParams) as DbRow[];
    return rows.map((row) => mapRowToRelatedMemory(row));
  }
}

export const memoryService = new MemoryService();
