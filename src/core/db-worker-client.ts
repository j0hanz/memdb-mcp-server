import process from 'node:process';
import { Worker } from 'node:worker_threads';

import type {
  DbWorkerCallMap,
  DbWorkerRequest,
  DbWorkerResponse,
} from './db-worker-protocol.js';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type PayloadFor<K extends keyof DbWorkerCallMap> =
  DbWorkerCallMap[K]['payload'];
type ResultFor<K extends keyof DbWorkerCallMap> = DbWorkerCallMap[K]['result'];
type ArgsFor<K extends keyof DbWorkerCallMap> =
  undefined extends PayloadFor<K>
    ? [payload?: PayloadFor<K>]
    : [payload: PayloadFor<K>];

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, PendingRequest>();

const rejectAll = (error: Error): void => {
  for (const entry of pending.values()) {
    entry.reject(error);
  }
  pending.clear();
};

const handleMessage = (message: DbWorkerResponse): void => {
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.ok) {
    entry.resolve(message.result);
    return;
  }
  entry.reject(new Error(message.error.message));
};

const createWorker = (): Worker => {
  const workerUrl = new URL(
    import.meta.url.endsWith('.ts') ? './db-worker.ts' : './db-worker.js',
    import.meta.url
  );
  const instance = new Worker(workerUrl, { execArgv: process.execArgv });

  instance.on('message', handleMessage);
  instance.on('error', (error) => {
    rejectAll(error);
  });
  instance.on('exit', (code) => {
    if (code !== 0) {
      rejectAll(new Error(`DB worker exited with code ${String(code)}`));
    }
    if (worker === instance) {
      worker = undefined;
    }
  });

  return instance;
};

const getWorker = (): Worker => {
  worker ??= createWorker();
  return worker;
};

const sendRequest = <K extends keyof DbWorkerCallMap>(
  instance: Worker,
  type: K,
  payload?: PayloadFor<K>
): Promise<ResultFor<K>> =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    const request = (
      payload === undefined ? { id, type } : { id, type, payload }
    ) as DbWorkerRequest;
    instance.postMessage(request);
  });

export const callDbWorker = <K extends keyof DbWorkerCallMap>(
  type: K,
  ...args: ArgsFor<K>
): Promise<ResultFor<K>> => {
  const payload = args[0];
  return sendRequest(getWorker(), type, payload);
};

export const closeDbWorker = async (): Promise<void> => {
  if (!worker) return;
  const instance = worker;
  try {
    await sendRequest(instance, 'close');
  } finally {
    worker = undefined;
    rejectAll(new Error('DB worker closed'));
    await instance.terminate();
  }
};
