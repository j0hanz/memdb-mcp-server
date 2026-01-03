import { parentPort } from 'node:worker_threads';

import { closeDb } from './database.js';
import type {
  DbWorkerRequest,
  DbWorkerResponse,
} from './db-worker-protocol.js';
import {
  createMemory,
  deleteMemory,
  getMemory,
  getRelated,
  getStats,
  linkMemories,
  searchMemories,
} from './memory-service-core.js';

const port = parentPort;
if (!port) {
  throw new Error('db-worker must be started as a worker thread');
}

const respond = (response: DbWorkerResponse): void => {
  port.postMessage(response);
};

const handleRequest = (request: DbWorkerRequest): DbWorkerResponse => {
  try {
    switch (request.type) {
      case 'createMemory': {
        const { content, tags, importance, memoryType } = request.payload;
        return {
          id: request.id,
          ok: true,
          result: createMemory(content, tags, importance, memoryType),
        };
      }
      case 'searchMemories': {
        const { query, limit, tags, minRelevance } = request.payload;
        return {
          id: request.id,
          ok: true,
          result: searchMemories(query, limit, tags, minRelevance),
        };
      }
      case 'getMemory':
        return {
          id: request.id,
          ok: true,
          result: getMemory(request.payload.hash),
        };
      case 'deleteMemory':
        return {
          id: request.id,
          ok: true,
          result: deleteMemory(request.payload.hash),
        };
      case 'linkMemories': {
        const { fromHash, toHash, relationType } = request.payload;
        return {
          id: request.id,
          ok: true,
          result: linkMemories(fromHash, toHash, relationType),
        };
      }
      case 'getRelated': {
        const { hash, relationType, depth } = request.payload;
        return {
          id: request.id,
          ok: true,
          result: getRelated(hash, relationType, depth),
        };
      }
      case 'getStats':
        return { id: request.id, ok: true, result: getStats() };
      case 'close':
        closeDb();
        return { id: request.id, ok: true, result: undefined };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: request.id, ok: false, error: { message } };
  }
};

port.on('message', (request: DbWorkerRequest) => {
  respond(handleRequest(request));
});
