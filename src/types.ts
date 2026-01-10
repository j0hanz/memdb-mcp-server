export interface Memory {
  readonly id: number;
  readonly content: string;
  readonly summary: string | undefined;
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
