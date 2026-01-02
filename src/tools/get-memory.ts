import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { GetMemoryInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerGetMemory(server: McpServer): void {
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
    (params) => {
      try {
        const { hash } = params;
        const result = memoryService.getMemory(hash);
        if (!result) {
          return createErrorResponse('E_NOT_FOUND', 'Memory not found');
        }
        return createToolResponse({
          ok: true,
          result: result,
        });
      } catch (err) {
        return createErrorResponse('E_GET_MEMORY', getErrorMessage(err));
      }
    }
  );
}
