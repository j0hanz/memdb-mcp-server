import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

import { deleteMemory, getMemory, getStats } from './core/memory-read.js';
import { createMemory, updateMemory } from './core/memory-write.js';
import { getRelated, linkMemories } from './core/relations.js';
import { searchMemories } from './core/search.js';
import {
  DefaultOutputSchema,
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
  GetRelatedInputSchema,
  LinkMemoriesInputSchema,
  MemoryStatsInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from './schemas.js';
import type {
  Memory,
  MemoryInsertResult,
  MemoryStats,
  MemoryUpdateResult,
  RelatedMemory,
  SearchResult,
  StatementResult,
} from './types.js';

type MaybePromise<T> = T | Promise<T>;

type CreateMemoryInput = Parameters<typeof createMemory>[0];
type UpdateMemoryArgs = Parameters<typeof updateMemory>;
type SearchInput = Parameters<typeof searchMemories>[0];
type GetRelatedInput = Parameters<typeof getRelated>[0];

type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDependencies {
  createMemory: (input: CreateMemoryInput) => MaybePromise<MemoryInsertResult>;
  updateMemory: (...args: UpdateMemoryArgs) => MaybePromise<MemoryUpdateResult>;
  getMemory: (hash: string) => MaybePromise<Memory | undefined>;
  deleteMemory: (hash: string) => MaybePromise<StatementResult>;
  searchMemories: (input: SearchInput) => MaybePromise<SearchResult[]>;
  linkMemories: (
    fromHash: string,
    toHash: string,
    relationType: string
  ) => MaybePromise<StatementResult>;
  getRelated: (input: GetRelatedInput) => MaybePromise<RelatedMemory[]>;
  getStats: () => MaybePromise<MemoryStats>;
}

const defaultDeps: ToolDependencies = {
  createMemory,
  updateMemory,
  getMemory,
  deleteMemory,
  searchMemories,
  linkMemories,
  getRelated,
  getStats,
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
  handler: (params: Record<string, unknown>) => MaybePromise<CallToolResult>
): ((params: Record<string, unknown>) => Promise<CallToolResult>) => {
  return async (params) => {
    try {
      return await handler(params);
    } catch (err) {
      return createErrorResponse(code, getErrorMessage(err));
    }
  };
};

interface ToolDef {
  name: string;
  options: {
    title: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (params: Record<string, unknown>) => Promise<CallToolResult>;
}

const buildCoreTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'store_memory',
    options: {
      title: 'Store Memory',
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_STORE_MEMORY', async (params) => {
      const input = StoreMemoryInputSchema.parse(params);
      const result = await deps.createMemory({
        content: input.content,
        tags: input.tags ?? [],
        importance: input.importance ?? 0,
        memoryType: input.memoryType ?? 'general',
      });
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
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_GET_MEMORY', async (params) => {
      const input = GetMemoryInputSchema.parse(params);
      const result = await deps.getMemory(input.hash);
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
      const result = await deps.deleteMemory(input.hash);
      if (result.changes === 0) {
        return createErrorResponse('E_NOT_FOUND', 'Memory not found');
      }
      return ok({ deleted: true });
    }),
  },
  {
    name: 'update_memory',
    options: {
      title: 'Update Memory',
      description:
        'Update memory metadata (importance, type, tags). Content cannot be changed.',
      inputSchema: UpdateMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_UPDATE_MEMORY', async (params) => {
      const input = UpdateMemoryInputSchema.parse(params);
      const { hash, ...options } = input;
      const result = await deps.updateMemory(hash, options);
      return ok(result);
    }),
  },
];

const buildSearchTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'search_memories',
    options: {
      title: 'Search Memories',
      description: 'Full-text search with filters',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_SEARCH_MEMORIES', async (params) => {
      const input = SearchMemoriesInputSchema.parse(params);
      const result = await deps.searchMemories(input);
      return ok(result);
    }),
  },
];

const buildRelationTools = (deps: ToolDependencies): ToolDef[] => [
  {
    name: 'link_memories',
    options: {
      title: 'Link Memories',
      description: 'Create relationship between memories',
      inputSchema: LinkMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_LINK_MEMORIES', async (params) => {
      const input = LinkMemoriesInputSchema.parse(params);
      await deps.linkMemories(input.fromHash, input.toHash, input.relationType);
      return ok({ linked: true });
    }),
  },
  {
    name: 'get_related',
    options: {
      title: 'Get Related Memories',
      description: 'Get memories related to a given memory',
      inputSchema: GetRelatedInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_GET_RELATED', async (params) => {
      const input = GetRelatedInputSchema.parse(params);
      const relatedInput = {
        hash: input.hash,
        depth: input.depth ?? 1,
        direction: input.direction ?? 'outgoing',
        ...(input.relationType !== undefined
          ? { relationType: input.relationType }
          : {}),
      };
      const result = await deps.getRelated(relatedInput);
      return ok(result);
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
  ...buildRelationTools(deps),
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
