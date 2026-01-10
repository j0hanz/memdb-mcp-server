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
import { searchMemories } from './core/search.js';
import {
  DefaultOutputSchema,
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
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
  SearchResult,
  StatementResult,
} from './types.js';

type MaybePromise<T> = T | Promise<T>;

type CreateMemoryInput = Parameters<typeof createMemory>[0];
type UpdateMemoryArgs = Parameters<typeof updateMemory>;
type SearchInput = Parameters<typeof searchMemories>[0];

type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDependencies {
  createMemory: (input: CreateMemoryInput) => MaybePromise<MemoryInsertResult>;
  updateMemory: (...args: UpdateMemoryArgs) => MaybePromise<MemoryUpdateResult>;
  getMemory: (hash: string) => MaybePromise<Memory | undefined>;
  deleteMemory: (hash: string) => MaybePromise<StatementResult>;
  searchMemories: (input: SearchInput) => MaybePromise<SearchResult[]>;
  getStats: () => MaybePromise<MemoryStats>;
}

const defaultDeps: ToolDependencies = {
  createMemory,
  updateMemory,
  getMemory,
  deleteMemory,
  searchMemories,
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
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_STORE_MEMORY', async (params) => {
      const input = StoreMemoryInputSchema.parse(params);
      const result = await deps.createMemory({
        content: input.content,
        tags: input.tags,
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
        'Update memory content. Returns new hash since content change affects the hash.',
      inputSchema: UpdateMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_UPDATE_MEMORY', async (params) => {
      const input = UpdateMemoryInputSchema.parse(params);
      const result = await deps.updateMemory(input.hash, {
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
