import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { memoryService } from '../core/memory-service.js';
import { createErrorResponse, getErrorMessage } from '../lib/errors.js';
import { createToolResponse } from '../lib/tool_response.js';
import { LinkMemoriesInputSchema } from '../schemas/inputs.js';
import { DefaultOutputSchema } from '../schemas/outputs.js';

export function registerLinkMemories(server: McpServer): void {
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
    (params) => {
      try {
        const { fromHash, toHash, relationType } = params;
        memoryService.linkMemories(fromHash, toHash, relationType);
        return createToolResponse({
          ok: true,
          result: { linked: true },
        });
      } catch (err) {
        return createErrorResponse('E_LINK_MEMORIES', getErrorMessage(err));
      }
    }
  );
}
