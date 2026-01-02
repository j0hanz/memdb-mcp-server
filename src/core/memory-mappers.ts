import type { Memory, SearchResult } from '../types/index.js';
import type { RelatedMemory } from './memory-types.js';

export type DbRow = Record<string, unknown>;

export const mapRowToMemory = (row: DbRow): Memory => ({
  id: row.id as number,
  content: row.content as string,
  summary: row.summary as string | undefined,
  importance: row.importance as number,
  memory_type: row.memory_type as string,
  created_at: row.created_at as string,
  accessed_at: row.accessed_at as string,
  hash: row.hash as string,
});

export const mapRowToSearchResult = (row: DbRow): SearchResult => ({
  ...mapRowToMemory(row),
  relevance: row.relevance as number | undefined,
});

export const mapRowToRelatedMemory = (row: DbRow): RelatedMemory => ({
  ...mapRowToMemory(row),
  relation_type: row.relation_type as string,
  depth: row.depth as number,
});
