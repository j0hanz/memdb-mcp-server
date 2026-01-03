import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

import {
  createMemory,
  deleteMemory,
  getMemory,
  getRelated,
  getStats,
  linkMemories,
  searchMemories,
} from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import {
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
  GetRelatedInputSchema,
  LinkMemoriesInputSchema,
  MemoryStatsInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoryInputSchema,
} from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

const ok = (result: unknown): CallToolResult => {
  const structured = { ok: true as const, result };
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

type ToolSchema = ZodRawShapeCompat | AnySchema;

interface ToolDef {
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

const tools: ToolDef[] = [
  {
    name: 'store_memory',
    options: {
      title: 'Store Memory',
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: (params) =>
      withError('E_STORE_MEMORY', () => {
        const { content, tags, importance, memoryType } = params as {
          content: string;
          tags?: string[];
          importance?: number;
          memoryType?: string;
        };
        return ok(
          createMemory(
            content,
            tags ?? [],
            importance ?? 0,
            memoryType ?? 'general'
          )
        );
      }),
  },
  {
    name: 'search_memories',
    options: {
      title: 'Search Memories',
      description: 'Full-text search with filters',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: (params) =>
      withError('E_SEARCH_MEMORIES', () => {
        const { query, limit, tags, minRelevance } = params as {
          query: string;
          limit?: number;
          tags?: string[];
          minRelevance?: number;
        };
        return ok(searchMemories(query, limit ?? 10, tags ?? [], minRelevance));
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
    handler: (params) =>
      withError('E_GET_MEMORY', () => {
        const { hash } = params as { hash: string };
        const result = getMemory(hash);
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
    handler: (params) =>
      withError('E_DELETE_MEMORY', () => {
        const { hash } = params as { hash: string };
        const result = deleteMemory(hash);
        if (result.changes === 0) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return ok({ deleted: true });
      }),
  },
  {
    name: 'link_memories',
    options: {
      title: 'Link Memories',
      description: 'Create relationship between memories',
      inputSchema: LinkMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: (params) =>
      withError('E_LINK_MEMORIES', () => {
        const { fromHash, toHash, relationType } = params as {
          fromHash: string;
          toHash: string;
          relationType: string;
        };
        linkMemories(fromHash, toHash, relationType);
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
    handler: (params) =>
      withError('E_GET_RELATED', () => {
        const { hash, relationType, depth } = params as {
          hash: string;
          relationType?: string;
          depth?: number;
        };
        return ok(getRelated(hash, relationType, depth ?? 1));
      }),
  },
  {
    name: 'memory_stats',
    options: {
      title: 'Memory Stats',
      description: 'Database statistics and health',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: () =>
      withError('E_MEMORY_STATS', () => {
        return ok(getStats());
      }),
  },
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
