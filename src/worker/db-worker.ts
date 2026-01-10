import { parentPort } from 'node:worker_threads';

import { closeDb } from '../core/db.js';
import { deleteMemory, getMemory, getStats } from '../core/memory-read.js';
import { createMemory, updateMemory } from '../core/memory-write.js';
import { getRelated, linkMemories } from '../core/relations.js';
import { searchMemories } from '../core/search.js';
import {
  GetMemoryInputSchema,
  GetRelatedInputSchema,
  LinkMemoriesInputSchema,
  MemoryStatsInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from '../schemas.js';
import type { WorkerAction } from './protocol.js';

type CreateMemoryInput = Parameters<typeof createMemory>[0];
type UpdateMemoryArgs = Parameters<typeof updateMemory>;
type SearchInput = Parameters<typeof searchMemories>[0];
type GetRelatedInput = Parameters<typeof getRelated>[0];

interface WorkerRequest {
  id: number;
  action: WorkerAction;
  params: unknown;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface LinkParams {
  fromHash: string;
  toHash: string;
  relationType: string;
}

const port = parentPort;
if (!port) {
  throw new Error('Missing parentPort');
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown error';
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isTwoItemArray = (value: unknown): value is [unknown, unknown] => {
  return Array.isArray(value) && value.length === 2;
};

const parseStoreMemoryInput = (params: unknown): CreateMemoryInput => {
  const parsed = StoreMemoryInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  const { content, tags, importance, memoryType } = parsed.data;
  const result: CreateMemoryInput = { content };
  if (tags !== undefined) result.tags = tags;
  if (importance !== undefined) result.importance = importance;
  if (memoryType !== undefined) result.memoryType = memoryType;
  return result;
};

const parseHashParam = (params: unknown, action: string): string => {
  const parsed = GetMemoryInputSchema.safeParse({ hash: params });
  if (!parsed.success) {
    throw new Error(`${action}: ${parsed.error.message}`);
  }
  return parsed.data.hash;
};

const parseSearchInput = (params: unknown): SearchInput => {
  const parsed = SearchMemoriesInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
};

const parseUpdateMemoryArgs = (params: unknown): UpdateMemoryArgs => {
  if (!isTwoItemArray(params)) {
    throw new Error('update_memory: expected [hash, options]');
  }
  const hash = params[0];
  const options = params[1];
  if (typeof hash !== 'string') {
    throw new Error('update_memory: hash must be a string');
  }
  if (!isRecord(options)) {
    throw new Error('update_memory: options must be an object');
  }
  const parsed = UpdateMemoryInputSchema.safeParse({ hash, ...options });
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  const { hash: parsedHash, ...parsedOptions } = parsed.data;
  return [parsedHash, parsedOptions];
};

const parseLinkParams = (params: unknown): LinkParams => {
  const parsed = LinkMemoriesInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  return parsed.data;
};

const parseGetRelatedInput = (params: unknown): GetRelatedInput => {
  const parsed = GetRelatedInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
  const { hash, relationType, depth, direction } = parsed.data;
  const result: GetRelatedInput = { hash };
  if (relationType !== undefined) result.relationType = relationType;
  if (depth !== undefined) result.depth = depth;
  if (direction !== undefined) result.direction = direction;
  return result;
};

const parseStatsParams = (params: unknown): void => {
  if (params == null) return;
  const parsed = MemoryStatsInputSchema.safeParse(params);
  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }
};

const handlers = new Map<WorkerAction, (params: unknown) => unknown>([
  ['store_memory', (params) => createMemory(parseStoreMemoryInput(params))],
  ['get_memory', (params) => getMemory(parseHashParam(params, 'get_memory'))],
  [
    'delete_memory',
    (params) => deleteMemory(parseHashParam(params, 'delete_memory')),
  ],
  [
    'update_memory',
    (params) => {
      const [hash, options] = parseUpdateMemoryArgs(params);
      return updateMemory(hash, options);
    },
  ],
  ['search_memories', (params) => searchMemories(parseSearchInput(params))],
  [
    'link_memories',
    (params) => {
      const input = parseLinkParams(params);
      return linkMemories(input.fromHash, input.toHash, input.relationType);
    },
  ],
  ['get_related', (params) => getRelated(parseGetRelatedInput(params))],
  [
    'memory_stats',
    (params) => {
      parseStatsParams(params);
      return getStats();
    },
  ],
]);

const isWorkerAction = (value: unknown): value is WorkerAction => {
  if (typeof value !== 'string') return false;
  return handlers.has(value as WorkerAction);
};

const isWorkerRequest = (value: unknown): value is WorkerRequest => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number') return false;
  if (!isWorkerAction(value.action)) return false;
  return 'params' in value;
};

const getHandler = (action: WorkerAction): ((params: unknown) => unknown) => {
  const handler = handlers.get(action);
  if (!handler) {
    throw new Error(`Unsupported action: ${action}`);
  }
  return handler;
};

const handleRequest = (request: WorkerRequest): WorkerResponse => {
  try {
    const handler = getHandler(request.action);
    const result = handler(request.params);
    return { id: request.id, ok: true, result };
  } catch (error) {
    return { id: request.id, ok: false, error: toErrorMessage(error) };
  }
};

const onMessage = (value: unknown): void => {
  if (!isWorkerRequest(value)) return;
  const response = handleRequest(value);
  port.postMessage(response);
};

port.on('message', onMessage);
process.on('exit', () => {
  closeDb();
});
