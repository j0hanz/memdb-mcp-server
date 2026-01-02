import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { StoreMemoryInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerStoreMemory(server: McpServer): void {
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
    (params) => {
      try {
        const { content, tags, importance, memoryType } = params;
        const result = memoryService.createMemory(
          content,
          tags,
          importance,
          memoryType
        );
        return createToolResponse({
          ok: true,
          result: result,
        });
      } catch (err) {
        return createErrorResponse('E_STORE_MEMORY', getErrorMessage(err));
      }
    }
  );
}
