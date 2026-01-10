import { Worker, type WorkerOptions } from 'node:worker_threads';

import type { ToolDependencies } from '../tools.js';
import type {
  Memory,
  MemoryInsertResult,
  MemoryStats,
  MemoryUpdateResult,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from '../types.js';
import { isWorkerResponse, type WorkerAction } from './protocol.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface DbWorkerClient {
  request<T>(action: WorkerAction, params: unknown): Promise<T>;
  close(): Promise<void>;
}

const resolveWorkerUrl = (): URL => {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  return new URL(`./db-worker.${extension}`, import.meta.url);
};

const WORKER_REQUEST_TIMEOUT_MS = 30000;

interface ModuleWorkerOptions extends WorkerOptions {
  type: 'module';
}

const createWorker = (): Worker => {
  const options: ModuleWorkerOptions = { type: 'module' };
  return new Worker(resolveWorkerUrl(), options);
};

const rejectAll = (
  pending: Map<number, PendingRequest>,
  error: Error
): void => {
  for (const entry of pending.values()) {
    clearTimeout(entry.timeout);
    entry.reject(error);
  }
  pending.clear();
};

const onWorkerMessage = (
  pending: Map<number, PendingRequest>,
  value: unknown
): void => {
  if (!isWorkerResponse(value)) return;
  const entry = pending.get(value.id);
  if (!entry) return;
  pending.delete(value.id);
  clearTimeout(entry.timeout);
  if (!value.ok) {
    entry.reject(new Error(value.error ?? 'Worker error'));
    return;
  }
  entry.resolve(value.result);
};

const createRequest = (
  worker: Worker,
  pending: Map<number, PendingRequest>,
  action: WorkerAction,
  params: unknown,
  id: number
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Worker request timed out'));
    }, WORKER_REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout });
    try {
      worker.postMessage({ id, action, params });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};

export const createDbWorkerClient = (): DbWorkerClient => {
  const worker = createWorker();
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();

  worker.on('message', (value) => {
    onWorkerMessage(pending, value);
  });
  worker.on('error', (error) => {
    const resolved = error instanceof Error ? error : new Error(String(error));
    rejectAll(pending, resolved);
  });
  worker.on('exit', (code) => {
    if (code !== 0) {
      rejectAll(pending, new Error(`Worker exited with code ${String(code)}`));
    }
  });

  const request = async <T>(
    action: WorkerAction,
    params: unknown
  ): Promise<T> => {
    const id = nextId;
    nextId += 1;
    const result = await createRequest(worker, pending, action, params, id);
    return result as T;
  };

  const close = async (): Promise<void> => {
    rejectAll(pending, new Error('Worker closed'));
    await worker.terminate();
  };

  return { request, close };
};

export const createWorkerToolDependencies = (
  client: DbWorkerClient
): ToolDependencies => {
  return {
    createMemory: (input) =>
      client.request<MemoryInsertResult>('store_memory', input),
    updateMemory: (hash, options) =>
      client.request<MemoryUpdateResult>('update_memory', [hash, options]),
    getMemory: (hash) => client.request<Memory | undefined>('get_memory', hash),
    deleteMemory: (hash) =>
      client.request<StatementResult>('delete_memory', hash),
    searchMemories: (input) =>
      client.request<SearchResult[]>('search_memories', input),
    linkMemories: (fromHash, toHash, relationType) =>
      client.request<StatementResult>('link_memories', {
        fromHash,
        toHash,
        relationType,
      }),
    getRelated: (input) =>
      client.request<RelatedMemory[]>('get_related', input),
    getStats: () => client.request<MemoryStats>('memory_stats', null),
  };
};
