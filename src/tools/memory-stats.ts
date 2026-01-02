import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { MemoryStatsInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerMemoryStats(server: McpServer): void {
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
    () => {
      try {
        const stats = memoryService.getStats();
        return createToolResponse({
          ok: true,
          result: stats,
        });
      } catch (err) {
        return createErrorResponse('E_MEMORY_STATS', getErrorMessage(err));
      }
    }
  );
}
