import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Use in-memory DB for tool handlers before module imports
process.env.MEMDB_PATH = ':memory:';

const { registerAllTools } = await import('../src/tools/index.js');
const { closeDb } = await import('../src/core/database.js');

type ToolRegistration = {
  name: string;
  handler: (params: unknown) => Promise<CallToolResult>;
  options: {
    title?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  };
};

const createServerStub = (): {
  server: McpServer;
  registrations: ToolRegistration[];
} => {
  const registrations: ToolRegistration[] = [];
  const server = {
    registerTool: (
      name: string,
      options: ToolRegistration['options'],
      handler: (params: unknown) => Promise<CallToolResult>
    ) => {
      registrations.push({ name, options, handler });
    },
  } as unknown as McpServer;

  return { server, registrations };
};

describe('tools', () => {
  it('registers all tools', () => {
    const { server, registrations } = createServerStub();
    registerAllTools(server);

    const names = registrations.map((entry) => entry.name).sort();
    assert.deepStrictEqual(names, [
      'delete_memory',
      'get_memory',
      'get_related',
      'link_memories',
      'memory_stats',
      'search_memories',
      'store_memory',
    ]);
  });

  it('returns structured content for store/get/delete', async () => {
    const { server, registrations } = createServerStub();
    registerAllTools(server);

    const store = registrations.find((entry) => entry.name === 'store_memory');
    const getMemory = registrations.find(
      (entry) => entry.name === 'get_memory'
    );
    const deleteMemory = registrations.find(
      (entry) => entry.name === 'delete_memory'
    );

    assert.ok(store && getMemory && deleteMemory, 'Handlers not registered');

    const stored = await store.handler({ content: 'Tool memory' });
    assert.ok(stored.structuredContent);
    assert.strictEqual(stored.structuredContent.ok, true);

    const hash = (stored.structuredContent as { result: { hash: string } })
      .result.hash;

    const fetched = await getMemory.handler({ hash });
    assert.ok(fetched.structuredContent);
    assert.strictEqual(fetched.structuredContent.ok, true);

    const deleted = await deleteMemory.handler({ hash });
    assert.ok(deleted.structuredContent);
    assert.strictEqual(deleted.structuredContent.ok, true);

    const missing = await deleteMemory.handler({ hash });
    assert.strictEqual(missing.isError, true);
    assert.match(JSON.stringify(missing.structuredContent), /E_NOT_FOUND/);
  });
});

after(() => {
  closeDb();
});
