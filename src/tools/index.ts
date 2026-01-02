import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerDeleteMemory } from './delete-memory.js';
import { registerGetMemory } from './get-memory.js';
import { registerGetRelated } from './get-related.js';
import { registerLinkMemories } from './link-memories.js';
import { registerMemoryStats } from './memory-stats.js';
import { registerSearchMemories } from './search-memories.js';
import { registerStoreMemory } from './store-memory.js';

export function registerAllTools(server: McpServer): void {
  registerStoreMemory(server);
  registerSearchMemories(server);
  registerGetMemory(server);
  registerDeleteMemory(server);
  registerLinkMemories(server);
  registerGetRelated(server);
  registerMemoryStats(server);
}
