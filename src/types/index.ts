export interface Memory {
  readonly id: number;
  readonly content: string;
  readonly summary: string | undefined;
  readonly importance: number;
  readonly memory_type: string;
  readonly created_at: string;
  readonly accessed_at: string;
  readonly hash: string;
}

export interface SearchResult extends Memory {
  readonly relevance: number | undefined;
}

export interface RelatedMemory extends Memory {
  readonly relation_type: string;
  readonly depth: number;
}

export interface StatementResult {
  readonly changes: number;
}

export interface MemoryInsertResult {
  readonly id: number;
  readonly hash: string;
  readonly isNew: boolean;
}

export interface MemoryStats {
  readonly memoryCount: number;
  readonly relationshipCount: number;
}
