import type {
  Memory,
  MemoryInsertResult,
  MemoryStats,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from '../types/index.js';

export interface DbWorkerCallMap {
  createMemory: {
    payload: {
      content: string;
      tags: readonly string[];
      importance: number;
      memoryType: string;
    };
    result: MemoryInsertResult;
  };
  searchMemories: {
    payload: {
      query: string;
      limit: number;
      tags: readonly string[];
      minRelevance?: number;
    };
    result: SearchResult[];
  };
  getMemory: {
    payload: { hash: string };
    result: Memory | undefined;
  };
  deleteMemory: {
    payload: { hash: string };
    result: StatementResult;
  };
  linkMemories: {
    payload: { fromHash: string; toHash: string; relationType: string };
    result: StatementResult;
  };
  getRelated: {
    payload: { hash: string; relationType?: string; depth: number };
    result: RelatedMemory[];
  };
  getStats: {
    payload: undefined;
    result: MemoryStats;
  };
  close: {
    payload: undefined;
    result: undefined;
  };
}

export type DbWorkerRequest = {
  [K in keyof DbWorkerCallMap]: {
    id: number;
    type: K;
  } & (DbWorkerCallMap[K]['payload'] extends undefined
    ? Record<string, never>
    : { payload: DbWorkerCallMap[K]['payload'] });
}[keyof DbWorkerCallMap];

export type DbWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string } };
