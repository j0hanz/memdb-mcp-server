import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import {
  deleteMemories,
  deleteMemory,
  getMemory,
  getStats,
} from './core/memory-read.js';
import {
  createMemories,
  createMemory,
  updateMemory,
} from './core/memory-write.js';
import {
  createRelationship,
  deleteRelationship,
  getRelationships,
} from './core/relationships.js';
import { recallMemories, searchMemories } from './core/search.js';
import {
  CreateRelationshipInputSchema,
  DefaultOutputSchema,
  DeleteMemoriesInputSchema,
  DeleteMemoryInputSchema,
  DeleteRelationshipInputSchema,
  GetMemoryInputSchema,
  GetRelationshipsInputSchema,
  MemoryStatsInputSchema,
  RecallInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoriesInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from './schemas.js';

type MaybePromise<T> = T | Promise<T>;

type CreateMemoryInput = Parameters<typeof createMemory>[0];

type Dependency<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => MaybePromise<R>
  : never;

type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDependencies {
  createMemory: Dependency<typeof createMemory>;
  createMemories: Dependency<typeof createMemories>;
  updateMemory: Dependency<typeof updateMemory>;
  getMemory: Dependency<typeof getMemory>;
  deleteMemory: Dependency<typeof deleteMemory>;
  deleteMemories: Dependency<typeof deleteMemories>;
  searchMemories: Dependency<typeof searchMemories>;
  getStats: Dependency<typeof getStats>;
  createRelationship: Dependency<typeof createRelationship>;
  getRelationships: Dependency<typeof getRelationships>;
  deleteRelationship: Dependency<typeof deleteRelationship>;
  recallMemories: Dependency<typeof recallMemories>;
}

const defaultDeps: ToolDependencies = {
  createMemory,
  createMemories,
  updateMemory,
  getMemory,
  deleteMemory,
  deleteMemories,
  searchMemories,
  getStats,
  createRelationship,
  getRelationships,
  deleteRelationship,
  recallMemories,
};

type ErrorResponse = CallToolResult & {
  content: { type: 'text'; text: string }[];
  structuredContent: {
    ok: false;
    error: { code: string; message: string };
    result?: unknown;
  };
  isError: true;
};

const TOOL_TIMEOUT_MS = config.toolTimeoutMs;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isNonEmptyString(error)) return error;
  return 'Unknown error';
};

const createErrorResponse = (
  code: string,
  message: string,
  result?: unknown
): ErrorResponse => {
  const structured: ErrorResponse['structuredContent'] = {
    ok: false,
    error: { code, message },
    ...(result !== undefined ? { result } : {}),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true,
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
  signal?: AbortSignal
): Promise<T> => {
  if (ms <= 0) return await promise;
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => {
      if (signal && typeof signal.dispatchEvent === 'function') {
        signal.dispatchEvent(new Event('abort'));
      }
      resolve(onTimeout());
    }, ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const createTimeoutResponse = (): ErrorResponse =>
  createErrorResponse(
    'E_TIMEOUT',
    `Tool execution timed out after ${TOOL_TIMEOUT_MS}ms`,
    { timeoutMs: TOOL_TIMEOUT_MS }
  );

const createSuccessResponse = (result: unknown): CallToolResult => {
  const structured = { ok: true, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

const runHandlerSafely = async (
  code: string,
  handler: (
    params: unknown,
    signal?: AbortSignal
  ) => MaybePromise<CallToolResult>,
  params: unknown
): Promise<CallToolResult> => {
  try {
    const controller = new AbortController();
    const resultPromise = Promise.resolve().then(() =>
      handler(params, controller.signal)
    );
    return await withTimeout(
      resultPromise,
      TOOL_TIMEOUT_MS,
      createTimeoutResponse,
      controller.signal
    );
  } catch (err) {
    return createErrorResponse(code, getErrorMessage(err));
  }
};

const wrapHandler = (
  code: string,
  handler: (
    params: unknown,
    signal?: AbortSignal
  ) => MaybePromise<CallToolResult>
): ((params: unknown) => Promise<CallToolResult>) => {
  return async (params: unknown) => runHandlerSafely(code, handler, params);
};

const normalizeHash = (hash: string): string => hash.toLowerCase();

interface ToolDef {
  name: string;
  options: {
    title: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (params: unknown) => Promise<CallToolResult>;
}

interface CreateMemoryInputBuildParams {
  content: string;
  tags: readonly string[];
  importance?: number | undefined;
  memory_type?: CreateMemoryInput['memory_type'] | undefined;
}

const toCreateMemoryInput = (
  input: CreateMemoryInputBuildParams
): CreateMemoryInput => ({
  content: input.content,
  tags: input.tags,
  ...(input.importance === undefined ? {} : { importance: input.importance }),
  ...(input.memory_type === undefined
    ? {}
    : { memory_type: input.memory_type }),
});

const buildStoreMemoryTool = (deps: ToolDependencies): ToolDef => ({
  name: 'store_memory',
  options: {
    title: 'Store Memory',
    description: 'Store a new memory with tags',
    inputSchema: StoreMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
  },
  handler: wrapHandler('E_STORE_MEMORY', async (params) => {
    const input = StoreMemoryInputSchema.parse(params);
    const result = await deps.createMemory(
      toCreateMemoryInput({
        content: input.content,
        tags: input.tags,
        importance: input.importance,
        memory_type: input.memory_type,
      })
    );
    return createSuccessResponse(result);
  }),
});

const buildStoreMemoriesTool = (deps: ToolDependencies): ToolDef => ({
  name: 'store_memories',
  options: {
    title: 'Store Multiple Memories',
    description:
      'Store multiple memories in a single batch operation. Returns per-item results with partial success support.',
    inputSchema: StoreMemoriesInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
  },
  handler: wrapHandler('E_STORE_MEMORIES', async (params) => {
    const input = StoreMemoriesInputSchema.parse(params);
    const items = input.items.map((item) =>
      toCreateMemoryInput({
        content: item.content,
        tags: item.tags,
        importance: item.importance,
        memory_type: item.memory_type,
      })
    );
    const result = await deps.createMemories(items);
    return createSuccessResponse(result);
  }),
});

const buildGetMemoryTool = (deps: ToolDependencies): ToolDef => ({
  name: 'get_memory',
  options: {
    title: 'Get Memory',
    description: 'Retrieve memory by hash',
    inputSchema: GetMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
  },
  handler: wrapHandler('E_GET_MEMORY', async (params) => {
    const input = GetMemoryInputSchema.parse(params);
    const result = await deps.getMemory(normalizeHash(input.hash));
    if (!result) {
      return createErrorResponse('E_NOT_FOUND', 'Memory not found');
    }
    return createSuccessResponse(result);
  }),
});

const buildDeleteMemoryTool = (deps: ToolDependencies): ToolDef => ({
  name: 'delete_memory',
  options: {
    title: 'Delete Memory',
    description: 'Delete by hash',
    inputSchema: DeleteMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { destructiveHint: true },
  },
  handler: wrapHandler('E_DELETE_MEMORY', async (params) => {
    const input = DeleteMemoryInputSchema.parse(params);
    const result = await deps.deleteMemory(normalizeHash(input.hash));
    if (result.changes === 0) {
      return createErrorResponse('E_NOT_FOUND', 'Memory not found');
    }
    return createSuccessResponse({ deleted: true });
  }),
});

const buildDeleteMemoriesTool = (deps: ToolDependencies): ToolDef => ({
  name: 'delete_memories',
  options: {
    title: 'Delete Multiple Memories',
    description:
      'Delete multiple memories by hash in a single batch operation. Returns per-item results with partial success support.',
    inputSchema: DeleteMemoriesInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { destructiveHint: true },
  },
  handler: wrapHandler('E_DELETE_MEMORIES', async (params) => {
    const input = DeleteMemoriesInputSchema.parse(params);
    const result = await deps.deleteMemories(input.hashes.map(normalizeHash));
    return createSuccessResponse(result);
  }),
});

const buildUpdateMemoryTool = (deps: ToolDependencies): ToolDef => ({
  name: 'update_memory',
  options: {
    title: 'Update Memory',
    description:
      'Update memory content. Returns new hash since content change affects the hash.',
    inputSchema: UpdateMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
  },
  handler: wrapHandler('E_UPDATE_MEMORY', async (params) => {
    const input = UpdateMemoryInputSchema.parse(params);
    const result = await deps.updateMemory(normalizeHash(input.hash), {
      content: input.content,
      tags: input.tags,
    });
    return createSuccessResponse(result);
  }),
});

const buildCoreTools = (deps: ToolDependencies): ToolDef[] => [
  buildStoreMemoryTool(deps),
  buildStoreMemoriesTool(deps),
  buildGetMemoryTool(deps),
  buildDeleteMemoryTool(deps),
  buildDeleteMemoriesTool(deps),
  buildUpdateMemoryTool(deps),
];

const buildSearchTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'search_memories',
    options: {
      title: 'Search Memories',
      description: 'Search memories by content and tags',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_SEARCH_MEMORIES', async (params, signal) => {
      const input = SearchMemoriesInputSchema.parse(params);
      const result = await deps.searchMemories({ query: input.query }, signal);
      return createSuccessResponse(result);
    }),
  },
  {
    name: 'recall',
    options: {
      title: 'Recall Memories',
      description:
        'Search for memories and traverse relationships to return a connected graph cluster. ' +
        'Use this for deeper context retrieval that follows knowledge graph connections.',
      inputSchema: RecallInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_RECALL', async (params, signal) => {
      const input = RecallInputSchema.parse(params);
      const result = await deps.recallMemories(
        {
          query: input.query,
          ...(input.depth !== undefined && { depth: input.depth }),
        },
        signal
      );
      return createSuccessResponse(result);
    }),
  },
];

const buildRelationshipTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'create_relationship',
    options: {
      title: 'Create Relationship',
      description:
        'Link two memories with a typed relationship. Creates a knowledge graph edge between memories.',
      inputSchema: CreateRelationshipInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_CREATE_RELATIONSHIP', async (params) => {
      const input = CreateRelationshipInputSchema.parse(params);
      const result = await deps.createRelationship({
        from_hash: normalizeHash(input.from_hash),
        to_hash: normalizeHash(input.to_hash),
        relation_type: input.relation_type,
      });
      return createSuccessResponse(result);
    }),
  },
  {
    name: 'get_relationships',
    options: {
      title: 'Get Relationships',
      description:
        'Get all relationships for a memory. Returns linked memories with relationship types.',
      inputSchema: GetRelationshipsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_GET_RELATIONSHIPS', async (params) => {
      const input = GetRelationshipsInputSchema.parse(params);
      const result = await deps.getRelationships({
        hash: normalizeHash(input.hash),
        ...(input.direction !== undefined && { direction: input.direction }),
      });
      return createSuccessResponse(result);
    }),
  },
  {
    name: 'delete_relationship',
    options: {
      title: 'Delete Relationship',
      description: 'Remove a relationship between two memories.',
      inputSchema: DeleteRelationshipInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { destructiveHint: true },
    },
    handler: wrapHandler('E_DELETE_RELATIONSHIP', async (params) => {
      const input = DeleteRelationshipInputSchema.parse(params);
      const result = await deps.deleteRelationship({
        from_hash: normalizeHash(input.from_hash),
        to_hash: normalizeHash(input.to_hash),
        relation_type: input.relation_type,
      });
      if (result.changes === 0) {
        return createErrorResponse('E_NOT_FOUND', 'Relationship not found');
      }
      return createSuccessResponse({ deleted: true });
    }),
  },
];

const buildStatsTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'memory_stats',
    options: {
      title: 'Memory Stats',
      description: 'Database statistics and health',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_MEMORY_STATS', async (params) => {
      MemoryStatsInputSchema.parse(params);
      const result = await deps.getStats();
      return createSuccessResponse(result);
    }),
  },
];

const buildTools = (deps: ToolDependencies): ToolDef[] => [
  ...buildCoreTools(deps),
  ...buildSearchTools(deps),
  ...buildRelationshipTools(deps),
  ...buildStatsTools(deps),
];

export function registerAllTools(
  server: McpServer,
  deps: ToolDependencies = defaultDeps
): void {
  const tools = buildTools(deps);
  for (const tool of tools) {
    server.registerTool(tool.name, tool.options, tool.handler);
  }
}
