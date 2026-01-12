export const MEMORY_TYPES = [
  'general',
  'fact',
  'plan',
  'decision',
  'reflection',
  'lesson',
  'error',
  'gradient',
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface Memory {
  readonly id: number;
  readonly content: string;
  readonly summary: string | undefined;
  readonly importance: number;
  readonly memory_type: MemoryType;
  readonly created_at: string;
  readonly accessed_at: string;
  readonly hash: string;
}

export interface SearchResult extends Memory {
  readonly relevance: number;
}

export interface StatementResult {
  readonly changes: number;
}

export interface MemoryInsertResult {
  readonly id: number;
  readonly hash: string;
  readonly isNew: boolean;
}

export interface MemoryUpdateResult {
  readonly updated: boolean;
  readonly oldHash: string;
  readonly newHash: string;
}

export interface MemoryStats {
  readonly memoryCount: number;
  readonly tagCount: number;
  readonly oldestMemory: string | null;
  readonly newestMemory: string | null;
}

export type BatchStoreItemResult =
  | {
      readonly ok: true;
      readonly index: number;
      readonly hash: string;
      readonly isNew: boolean;
    }
  | {
      readonly ok: false;
      readonly index: number;
      readonly error: string;
    };

export interface BatchStoreResult {
  readonly results: BatchStoreItemResult[];
  readonly succeeded: number;
  readonly failed: number;
}

export interface BatchDeleteItemResult {
  readonly hash: string;
  readonly deleted: boolean;
  readonly error?: string;
}

export interface BatchDeleteResult {
  readonly results: BatchDeleteItemResult[];
  readonly succeeded: number;
  readonly failed: number;
}

export interface Relationship {
  readonly id: number;
  readonly from_hash: string;
  readonly to_hash: string;
  readonly relation_type: string;
  readonly created_at: string;
}

export interface CreateRelationshipResult {
  readonly id: number;
  readonly isNew: boolean;
}

export interface RelationshipWithMemories {
  readonly relationship: Relationship;
  readonly from_memory: Memory;
  readonly to_memory: Memory;
}

export interface RecallResult {
  readonly memories: SearchResult[];
  readonly relationships: Relationship[];
  readonly depth: number;
}
