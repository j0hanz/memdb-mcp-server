import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
import { createToolResponse } from '../lib/tool_response.js';
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

const ok = (result: unknown): CallToolResult =>
  createToolResponse({ ok: true, result });

export function registerAllTools(server: McpServer): void {
  server.registerTool(
    'store_memory',
    {
      title: 'Store Memory',
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        idempotentHint: true,
      },
    },
    async (params) => {
      try {
        const { content, tags, importance, memoryType } = params;
        return ok(
          await createMemory(
            content,
            tags ?? [],
            importance ?? 0,
            memoryType ?? 'general'
          )
        );
      } catch (err) {
        return createErrorResponse('E_STORE_MEMORY', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'search_memories',
    {
      title: 'Search Memories',
      description: 'Full-text search with filters',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const { query, limit, tags, minRelevance } = params;
        return ok(
          await searchMemories(query, limit ?? 10, tags ?? [], minRelevance)
        );
      } catch (err) {
        return createErrorResponse('E_SEARCH_MEMORIES', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'get_memory',
    {
      title: 'Get Memory',
      description: 'Retrieve memory by hash',
      inputSchema: GetMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const { hash } = params;
        const result = await getMemory(hash);
        if (!result) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return ok(result);
      } catch (err) {
        return createErrorResponse('E_GET_MEMORY', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description: 'Delete by hash',
      inputSchema: DeleteMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        destructiveHint: true,
      },
    },
    async (params) => {
      try {
        const { hash } = params;
        const result = await deleteMemory(hash);
        if (result.changes === 0) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return ok({ deleted: true });
      } catch (err) {
        return createErrorResponse('E_DELETE_MEMORY', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'link_memories',
    {
      title: 'Link Memories',
      description: 'Create relationship between memories',
      inputSchema: LinkMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        idempotentHint: true,
      },
    },
    async (params) => {
      try {
        const { fromHash, toHash, relationType } = params;
        await linkMemories(fromHash, toHash, relationType);
        return ok({ linked: true });
      } catch (err) {
        return createErrorResponse('E_LINK_MEMORIES', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'get_related',
    {
      title: 'Get Related Memories',
      description: 'Get memories related to a given memory',
      inputSchema: GetRelatedInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (params) => {
      try {
        const { hash, relationType, depth } = params;
        return ok(await getRelated(hash, relationType, depth ?? 1));
      } catch (err) {
        return createErrorResponse('E_GET_RELATED', getErrorMessage(err));
      }
    }
  );

  server.registerTool(
    'memory_stats',
    {
      title: 'Memory Stats',
      description: 'Database statistics and health',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        return ok(await getStats());
      } catch (err) {
        return createErrorResponse('E_MEMORY_STATS', getErrorMessage(err));
      }
    }
  );
}
