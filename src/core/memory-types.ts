import type { Memory } from '../types/index.js';

export interface RelatedMemory extends Memory {
  relation_type: string;
  depth: number;
}

export interface StatementResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

export interface MemoryInsertResult {
  id: number;
  hash: string;
  isNew: boolean;
}

export interface MemoryStats {
  memoryCount: number;
  relationshipCount: number;
}
