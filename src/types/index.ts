export interface Memory {
  id: number;
  content: string;
  summary: string | undefined;
  importance: number;
  memory_type: string;
  created_at: string;
  accessed_at: string;
  hash: string;
}

export interface Relationship {
  id: number;
  from_memory_id: number;
  to_memory_id: number;
  relation_type: string;
  created_at: string;
}

export interface SearchResult extends Memory {
  relevance: number | undefined;
  matchedTags?: string[];
}

export interface RelatedMemory extends Memory {
  relation_type: string;
  depth: number;
}

export interface StatementResult {
  changes: number;
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
