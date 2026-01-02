import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { DeleteMemoryInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerDeleteMemory(server: McpServer): void {
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
    (params) => {
      try {
        const { hash } = params;
        memoryService.deleteMemory(hash);
        return createToolResponse({
          ok: true,
          result: { deleted: true },
        });
      } catch (err) {
        return createErrorResponse('E_DELETE_MEMORY', getErrorMessage(err));
      }
    }
  );
}
