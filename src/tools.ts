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

type ErrorResponse = CallToolResult & {
  content: { type: 'text'; text: string }[];
  structuredContent: {
    ok: false;
    error: { code: string; message: string };
    result?: unknown;
  };
  isError: true;
};

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return toNonEmptyString(error) ?? 'Unknown error';
}

export function createErrorResponse(
  code: string,
  message: string,
  result?: unknown
): ErrorResponse {
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
}

const ok = (result: unknown): CallToolResult => {
  const structured = { ok: true, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

const withError = (code: string, fn: () => CallToolResult): CallToolResult => {
  try {
    return fn();
  } catch (err) {
    return createErrorResponse(code, getErrorMessage(err));
  }
};

const wrapHandler = (
  code: string,
  handler: (params: Record<string, unknown>) => CallToolResult
): ((params: Record<string, unknown>) => CallToolResult) => {
  return (params) => withError(code, () => handler(params));
};

export type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDef {
  name: string;
  options: {
    title: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (params: Record<string, unknown>) => CallToolResult;
}

export const coreTools: ToolDef[] = [
  {
    name: 'store_memory',
    options: {
      title: 'Store Memory',
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_STORE_MEMORY', (params) => {
      const input = StoreMemoryInputSchema.parse(params);
      return ok(
        createMemory({
          content: input.content,
          tags: input.tags ?? [],
          importance: input.importance ?? 0,
          memoryType: input.memoryType ?? 'general',
        })
      );
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
    handler: wrapHandler('E_GET_MEMORY', (params) => {
      const input = GetMemoryInputSchema.parse(params);
      const result = getMemory(input.hash);
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
    handler: wrapHandler('E_DELETE_MEMORY', (params) => {
      const input = DeleteMemoryInputSchema.parse(params);
      const result = deleteMemory(input.hash);
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
    handler: wrapHandler('E_UPDATE_MEMORY', (params) => {
      const input = UpdateMemoryInputSchema.parse(params);
      const { hash, ...options } = input;
      return ok(updateMemory(hash, options));
    }),
  },
];

export const searchTools: ToolDef[] = [
  {
    name: 'search_memories',
    options: {
      title: 'Search Memories',
      description: 'Full-text search with filters',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_SEARCH_MEMORIES', (params) => {
      const input = SearchMemoriesInputSchema.parse(params);
      return ok(searchMemories(input));
    }),
  },
];

export const relationTools: ToolDef[] = [
  {
    name: 'link_memories',
    options: {
      title: 'Link Memories',
      description: 'Create relationship between memories',
      inputSchema: LinkMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_LINK_MEMORIES', (params) => {
      const input = LinkMemoriesInputSchema.parse(params);
      linkMemories(input.fromHash, input.toHash, input.relationType);
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
    handler: wrapHandler('E_GET_RELATED', (params) => {
      const input = GetRelatedInputSchema.parse(params);
      const relatedInput = {
        hash: input.hash,
        depth: input.depth ?? 1,
        direction: input.direction ?? 'outgoing',
        ...(input.relationType !== undefined
          ? { relationType: input.relationType }
          : {}),
      };
      return ok(getRelated(relatedInput));
    }),
  },
];

export const statsTools: ToolDef[] = [
  {
    name: 'memory_stats',
    options: {
      title: 'Memory Stats',
      description: 'Database statistics and health',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_MEMORY_STATS', (params) => {
      MemoryStatsInputSchema.parse(params);
      return ok(getStats());
    }),
  },
];

const tools: ToolDef[] = [
  ...coreTools,
  ...searchTools,
  ...relationTools,
  ...statsTools,
];

export function registerAllTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      tool.options,
      (params: Record<string, unknown>) => Promise.resolve(tool.handler(params))
    );
  }
}
