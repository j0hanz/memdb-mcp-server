import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { SearchMemoriesInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerSearchMemories(server: McpServer): void {
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
    (params) => {
      try {
        const { query, limit, tags, minRelevance } = params;
        const results = memoryService.searchMemories(
          query,
          limit,
          tags ?? [],
          minRelevance
        );
        return createToolResponse({
          ok: true,
          result: results,
        });
      } catch (err) {
        return createErrorResponse('E_SEARCH_MEMORIES', getErrorMessage(err));
      }
    }
  );
}
