export type WorkerAction =
  | 'store_memory'
  | 'get_memory'
  | 'delete_memory'
  | 'update_memory'
  | 'search_memories'
  | 'link_memories'
  | 'get_related'
  | 'memory_stats';

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const isWorkerResponse = (value: unknown): value is WorkerResponse => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number') return false;
  if (typeof value.ok !== 'boolean') return false;
  if (!value.ok && typeof value.error !== 'string') return false;
  return true;
};
