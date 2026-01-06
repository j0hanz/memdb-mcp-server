import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { tools } from './tool-definitions.js';

export function registerAllTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      tool.options,
      (params: Record<string, unknown>) => Promise.resolve(tool.handler(params))
    );
  }
}
