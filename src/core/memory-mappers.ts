import type { Memory, SearchResult } from '../types/index.js';
import type { RelatedMemory } from './memory-types.js';

export type DbRow = Record<string, unknown>;

const toNumber = (value: unknown, field: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  throw new Error(`Invalid ${field}`);
};

export const toSafeInteger = (value: unknown, field: string): number => {
  const numeric = toNumber(value, field);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`Invalid ${field}`);
  }
  return numeric;
};

export const toString = (value: unknown, field: string): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Invalid ${field}`);
};

export const toOptionalString = (
  value: unknown,
  field: string
): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return toString(value, field);
};

export const toOptionalNumber = (
  value: unknown,
  field: string
): number | undefined => {
  if (value === null || value === undefined) return undefined;
  return toNumber(value, field);
};

export const mapRowToMemory = (row: DbRow): Memory => ({
  id: toSafeInteger(row.id, 'id'),
  content: toString(row.content, 'content'),
  summary: toOptionalString(row.summary, 'summary'),
  importance: toSafeInteger(row.importance, 'importance'),
  memory_type: toString(row.memory_type, 'memory_type'),
  created_at: toString(row.created_at, 'created_at'),
  accessed_at: toString(row.accessed_at, 'accessed_at'),
  hash: toString(row.hash, 'hash'),
});

export const mapRowToSearchResult = (row: DbRow): SearchResult => ({
  ...mapRowToMemory(row),
  relevance: toOptionalNumber(row.relevance, 'relevance'),
});

export const mapRowToRelatedMemory = (row: DbRow): RelatedMemory => ({
  ...mapRowToMemory(row),
  relation_type: toString(row.relation_type, 'relation_type'),
  depth: toSafeInteger(row.depth, 'depth'),
});
