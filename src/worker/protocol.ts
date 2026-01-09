const WORKER_ACTIONS = [
  'store_memory',
  'get_memory',
  'delete_memory',
  'update_memory',
  'search_memories',
  'link_memories',
  'get_related',
  'memory_stats',
] as const;

export type WorkerAction = (typeof WORKER_ACTIONS)[number];

export interface WorkerRequest {
  id: number;
  action: WorkerAction;
  params: unknown;
}

export interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const isWorkerAction = (value: unknown): value is WorkerAction => {
  if (typeof value !== 'string') return false;
  return WORKER_ACTIONS.includes(value as WorkerAction);
};

export const isWorkerRequest = (value: unknown): value is WorkerRequest => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number') return false;
  if (!isWorkerAction(value.action)) return false;
  return 'params' in value;
};

export const isWorkerResponse = (value: unknown): value is WorkerResponse => {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number') return false;
  if (typeof value.ok !== 'boolean') return false;
  if (!value.ok && typeof value.error !== 'string') return false;
  return true;
};
