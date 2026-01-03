import type {
  Memory,
  MemoryInsertResult,
  MemoryStats,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from '../types/index.js';
import { callDbWorker } from './db-worker-client.js';

export const createMemory = async (
  content: string,
  tags: readonly string[] = [],
  importance = 0,
  memoryType = 'general'
): Promise<MemoryInsertResult> =>
  callDbWorker('createMemory', {
    content,
    tags,
    importance,
    memoryType,
  });

export const searchMemories = async (
  query: string,
  limit = 10,
  tags: readonly string[] = [],
  minRelevance?: number
): Promise<SearchResult[]> => {
  const payload: {
    query: string;
    limit: number;
    tags: readonly string[];
    minRelevance?: number;
  } = { query, limit, tags };
  if (minRelevance !== undefined) {
    payload.minRelevance = minRelevance;
  }
  return callDbWorker('searchMemories', payload);
};

export const getMemory = async (hash: string): Promise<Memory | undefined> =>
  callDbWorker('getMemory', { hash });

export const deleteMemory = async (hash: string): Promise<StatementResult> =>
  callDbWorker('deleteMemory', { hash });

export const linkMemories = async (
  fromHash: string,
  toHash: string,
  relationType: string
): Promise<StatementResult> =>
  callDbWorker('linkMemories', { fromHash, toHash, relationType });

export const getRelated = async (
  hash: string,
  relationType?: string,
  depth = 1
): Promise<RelatedMemory[]> => {
  const payload: { hash: string; relationType?: string; depth: number } = {
    hash,
    depth,
  };
  if (relationType !== undefined) {
    payload.relationType = relationType;
  }
  return callDbWorker('getRelated', payload);
};

export const getStats = async (): Promise<MemoryStats> =>
  callDbWorker('getStats');
