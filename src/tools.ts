import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

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
import type {
  BatchDeleteResult,
  BatchStoreResult,
  CreateRelationshipResult,
  Memory,
  MemoryInsertResult,
  MemoryStats,
  MemoryUpdateResult,
  RecallResult,
  Relationship,
  SearchResult,
  StatementResult,
} from './types.js';

type MaybePromise<T> = T | Promise<T>;

type CreateMemoryInput = Parameters<typeof createMemory>[0];
type CreateMemoriesInput = Parameters<typeof createMemories>[0];
type UpdateMemoryArgs = Parameters<typeof updateMemory>;
type SearchInput = Parameters<typeof searchMemories>[0];
type DeleteMemoriesInput = Parameters<typeof deleteMemories>[0];
type CreateRelationshipInput = Parameters<typeof createRelationship>[0];
type GetRelationshipsInput = Parameters<typeof getRelationships>[0];
type DeleteRelationshipInput = Parameters<typeof deleteRelationship>[0];
type RecallInput = Parameters<typeof recallMemories>[0];

type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDependencies {
  createMemory: (input: CreateMemoryInput) => MaybePromise<MemoryInsertResult>;
  createMemories: (
    input: CreateMemoriesInput
  ) => MaybePromise<BatchStoreResult>;
  updateMemory: (...args: UpdateMemoryArgs) => MaybePromise<MemoryUpdateResult>;
  getMemory: (hash: string) => MaybePromise<Memory | undefined>;
  deleteMemory: (hash: string) => MaybePromise<StatementResult>;
  deleteMemories: (
    input: DeleteMemoriesInput
  ) => MaybePromise<BatchDeleteResult>;
  searchMemories: (input: SearchInput) => MaybePromise<SearchResult[]>;
  getStats: () => MaybePromise<MemoryStats>;
  createRelationship: (
    input: CreateRelationshipInput
  ) => MaybePromise<CreateRelationshipResult>;
  getRelationships: (
    input: GetRelationshipsInput
  ) => MaybePromise<Relationship[]>;
  deleteRelationship: (
    input: DeleteRelationshipInput
  ) => MaybePromise<StatementResult>;
  recallMemories: (input: RecallInput) => MaybePromise<RecallResult>;
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

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
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

const ok = (result: unknown): CallToolResult => {
  const structured = { ok: true, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

const wrapHandler = (
  code: string,
  handler: (params: unknown) => MaybePromise<CallToolResult>
): ((params: unknown) => Promise<CallToolResult>) => {
  return async (params: unknown) => {
    try {
      return await handler(params);
    } catch (err) {
      return createErrorResponse(code, getErrorMessage(err));
    }
  };
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

const buildCoreTools = (deps: ToolDependencies): ToolDef[] => [
  {
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
      const result = await deps.createMemory({
        content: input.content,
        tags: input.tags,
        ...(input.importance !== undefined && { importance: input.importance }),
        ...(input.memory_type !== undefined && {
          memory_type: input.memory_type,
        }),
      });
      return ok(result);
    }),
  },
  {
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
      const items = input.items.map((item) => ({
        content: item.content,
        tags: item.tags,
        ...(item.importance !== undefined && { importance: item.importance }),
        ...(item.memory_type !== undefined && {
          memory_type: item.memory_type,
        }),
      }));
      const result = await deps.createMemories(items);
      return ok(result);
    }),
  },
  {
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
      return ok(result);
    }),
  },
  {
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
      return ok({ deleted: true });
    }),
  },
  {
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
      return ok(result);
    }),
  },
  {
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
      return ok(result);
    }),
  },
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
    handler: wrapHandler('E_SEARCH_MEMORIES', async (params) => {
      const input = SearchMemoriesInputSchema.parse(params);
      const result = await deps.searchMemories({ query: input.query });
      return ok(result);
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
    handler: wrapHandler('E_RECALL', async (params) => {
      const input = RecallInputSchema.parse(params);
      const result = await deps.recallMemories({
        query: input.query,
        ...(input.depth !== undefined && { depth: input.depth }),
      });
      return ok(result);
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
      return ok(result);
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
      return ok(result);
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
      return ok({ deleted: true });
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
      return ok(result);
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
