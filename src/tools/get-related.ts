import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { GetRelatedInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerGetRelated(server: McpServer): void {
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
    (params) => {
      try {
        const { hash, relationType, depth } = params;
        const results = memoryService.getRelated(hash, relationType, depth);
        return createToolResponse({
          ok: true,
          result: results,
        });
      } catch (err) {
        return createErrorResponse('E_GET_RELATED', getErrorMessage(err));
      }
    }
  );
}
