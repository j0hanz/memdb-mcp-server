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

const registerStoreMemoryTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { content, tags, importance, memoryType } = params;
        return ok(
          createMemory(
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
};

const registerSearchMemoriesTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { query, limit, tags, minRelevance } = params;
        return ok(searchMemories(query, limit ?? 10, tags ?? [], minRelevance));
      } catch (err) {
        return createErrorResponse('E_SEARCH_MEMORIES', getErrorMessage(err));
      }
    }
  );
};

const registerGetMemoryTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { hash } = params;
        const result = getMemory(hash);
        if (!result) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return ok(result);
      } catch (err) {
        return createErrorResponse('E_GET_MEMORY', getErrorMessage(err));
      }
    }
  );
};

const registerDeleteMemoryTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { hash } = params;
        const result = deleteMemory(hash);
        if (result.changes === 0) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return ok({ deleted: true });
      } catch (err) {
        return createErrorResponse('E_DELETE_MEMORY', getErrorMessage(err));
      }
    }
  );
};

const registerLinkMemoriesTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { fromHash, toHash, relationType } = params;
        linkMemories(fromHash, toHash, relationType);
        return ok({ linked: true });
      } catch (err) {
        return createErrorResponse('E_LINK_MEMORIES', getErrorMessage(err));
      }
    }
  );
};

const registerGetRelatedTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        const { hash, relationType, depth } = params;
        return ok(getRelated(hash, relationType, depth ?? 1));
      } catch (err) {
        return createErrorResponse('E_GET_RELATED', getErrorMessage(err));
      }
    }
  );
};

const registerMemoryStatsTool = (server: McpServer): void => {
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
      await Promise.resolve();
      try {
        return ok(getStats());
      } catch (err) {
        return createErrorResponse('E_MEMORY_STATS', getErrorMessage(err));
      }
    }
  );
};

export function registerAllTools(server: McpServer): void {
  registerStoreMemoryTool(server);
  registerSearchMemoriesTool(server);
  registerGetMemoryTool(server);
  registerDeleteMemoryTool(server);
  registerLinkMemoriesTool(server);
  registerGetRelatedTool(server);
  registerMemoryStatsTool(server);
}
