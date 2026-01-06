import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { coreTools } from './definitions/memory-core.js';
import { relationTools } from './definitions/memory-relations.js';
import { searchTools } from './definitions/memory-search.js';
import { statsTools } from './definitions/memory-stats.js';
import type { ToolDef } from './tool-types.js';

const tools: ToolDef[] = [
  ...coreTools,
  ...searchTools,
  ...relationTools,
  ...statsTools,
];

export function registerAllTools(server: McpServer): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      tool.options,
      (params: Record<string, unknown>) => Promise.resolve(tool.handler(params))
    );
  }
}
