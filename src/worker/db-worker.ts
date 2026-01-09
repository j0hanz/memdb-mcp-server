import { parentPort } from 'node:worker_threads';

import { closeDb } from '../core/db.js';
import { deleteMemory, getMemory, getStats } from '../core/memory-read.js';
import { createMemory, updateMemory } from '../core/memory-write.js';
import { getRelated, linkMemories } from '../core/relations.js';
import { searchMemories } from '../core/search.js';
import {
  isWorkerRequest,
  type WorkerAction,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol.js';

type CreateMemoryInput = Parameters<typeof createMemory>[0];
type UpdateMemoryArgs = Parameters<typeof updateMemory>;
type SearchInput = Parameters<typeof searchMemories>[0];
type GetRelatedInput = Parameters<typeof getRelated>[0];

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

const handlers = new Map<WorkerAction, (params: unknown) => unknown>([
  ['store_memory', (params) => createMemory(params as CreateMemoryInput)],
  ['get_memory', (params) => getMemory(params as string)],
  ['delete_memory', (params) => deleteMemory(params as string)],
  [
    'update_memory',
    (params) => {
      const [hash, options] = params as UpdateMemoryArgs;
      return updateMemory(hash, options);
    },
  ],
  ['search_memories', (params) => searchMemories(params as SearchInput)],
  [
    'link_memories',
    (params) => {
      const input = params as LinkParams;
      return linkMemories(input.fromHash, input.toHash, input.relationType);
    },
  ],
  ['get_related', (params) => getRelated(params as GetRelatedInput)],
  ['memory_stats', () => getStats()],
]);

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
