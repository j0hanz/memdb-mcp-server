import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

process.env.MEMDB_PATH = ':memory:';

const { registerAllTools } = await import('../src/tools.js');
const { closeDb } = await import('../src/core/db.js');

interface ToolRegistration {
  name: string;
  handler: (params: unknown) => Promise<CallToolResult>;
  options: {
    title?: string;
    description?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
  };
}

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

const getTool = (
  registrations: ToolRegistration[],
  name: string
): ToolRegistration => {
  const tool = registrations.find((entry) => entry.name === name);
  assert.ok(tool, `Handler ${name} not registered`);
  return tool;
};

const assertOk = (result: CallToolResult): void => {
  assert.ok(result.structuredContent);
  assert.strictEqual(result.structuredContent.ok, true);
};

const getHash = (result: CallToolResult): string => {
  const structured = result.structuredContent as { result: { hash: string } };
  return structured.result.hash;
};

const setupRegistrations = (): ToolRegistration[] => {
  const { server, registrations } = createServerStub();
  registerAllTools(server);
  return registrations;
};

void describe('tools registration', () => {
  void it('registers all tools', () => {
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
      'update_memory',
    ]);
  });
});

void describe('tools responses store/get/delete', () => {
  void it('returns structured content for store/get/delete', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const getMemory = getTool(registrations, 'get_memory');
    const deleteMemory = getTool(registrations, 'delete_memory');

    const stored = await store.handler({ content: 'Tool memory' });
    assertOk(stored);

    const hash = getHash(stored);

    const fetched = await getMemory.handler({ hash });
    assertOk(fetched);

    const deleted = await deleteMemory.handler({ hash });
    assertOk(deleted);

    const missing = await deleteMemory.handler({ hash });
    assert.strictEqual(missing.isError, true);
    assert.match(JSON.stringify(missing.structuredContent), /E_NOT_FOUND/);
  });
});

void describe('tools responses search/update', () => {
  void it('supports search and update', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const search = getTool(registrations, 'search_memories');
    const update = getTool(registrations, 'update_memory');

    const stored = await store.handler({
      content: 'Searchable memory',
      tags: ['t'],
    });
    assertOk(stored);
    const hash = getHash(stored);

    const searched = await search.handler({ query: 'Searchable', tags: ['t'] });
    assertOk(searched);

    const updated = await update.handler({ hash, importance: 4 });
    assertOk(updated);
  });

  void it('rejects overly long search token lists', async () => {
    const registrations = setupRegistrations();
    const search = getTool(registrations, 'search_memories');

    const query = Array.from({ length: 51 }, (_, i) => `t${String(i)}`).join(
      ' '
    );
    const result = await search.handler({ query });

    assert.strictEqual(result.isError, true);
    assert.match(JSON.stringify(result.structuredContent), /E_SEARCH_MEMORIES/);
    assert.match(JSON.stringify(result.structuredContent), /too many terms/);
  });
});

void describe('tools responses relationships/stats', () => {
  void it('supports linking and related', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const link = getTool(registrations, 'link_memories');
    const related = getTool(registrations, 'get_related');

    const storedA = await store.handler({ content: 'Node A' });
    const storedB = await store.handler({ content: 'Node B' });
    assertOk(storedA);
    assertOk(storedB);

    const hashA = getHash(storedA);
    const hashB = getHash(storedB);

    const linked = await link.handler({
      fromHash: hashA,
      toHash: hashB,
      relationType: 'linked',
    });
    assertOk(linked);

    const relatedResult = await related.handler({
      hash: hashA,
      relationType: 'linked',
    });
    assertOk(relatedResult);
  });

  void it('returns stats response', async () => {
    const registrations = setupRegistrations();

    const stats = getTool(registrations, 'memory_stats');
    const statsResult = await stats.handler({});
    assertOk(statsResult);
  });
});

after(() => {
  closeDb();
});
