import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

process.env.MEMDB_PATH = ':memory:';

const { registerAllTools } = await import('../src/tools.js');
const { closeDb, initDb } = await import('../src/core/db.js');

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

const getTags = (result: CallToolResult): string[] => {
  const structured = result.structuredContent as { result: { tags: string[] } };
  return structured.result.tags;
};

const getImportance = (result: CallToolResult): number => {
  const structured = result.structuredContent as {
    result: { importance: number };
  };
  return structured.result.importance;
};

const getMemoryType = (result: CallToolResult): string => {
  const structured = result.structuredContent as {
    result: { memory_type: string };
  };
  return structured.result.memory_type;
};

const setupRegistrations = (): ToolRegistration[] => {
  const { server, registrations } = createServerStub();
  registerAllTools(server);
  return registrations;
};

before(async () => {
  await initDb();
});

void describe('tools registration', () => {
  void it('registers all tools', () => {
    const { server, registrations } = createServerStub();
    registerAllTools(server);

    const names = registrations.map((entry) => entry.name).sort();
    assert.deepStrictEqual(names, [
      'create_relationship',
      'delete_memories',
      'delete_memory',
      'delete_relationship',
      'get_memory',
      'get_relationships',
      'memory_stats',
      'recall',
      'search_memories',
      'store_memories',
      'store_memory',
      'update_memory',
    ]);
  });
});

void describe('tools responses store/get/delete', () => {
  void it('returns structured content for store/get/delete', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const storeBatch = getTool(registrations, 'store_memories');
    const getMemory = getTool(registrations, 'get_memory');
    const deleteMemory = getTool(registrations, 'delete_memory');

    const stored = await store.handler({
      content: 'Tool memory',
      tags: ['test'],
      importance: 7,
      memory_type: 'fact',
    });
    assertOk(stored);

    const hash = getHash(stored);

    const fetched = await getMemory.handler({ hash });
    assertOk(fetched);
    assert.deepStrictEqual(getTags(fetched), ['test']);
    assert.strictEqual(getImportance(fetched), 7);
    assert.strictEqual(getMemoryType(fetched), 'fact');

    const batch = await storeBatch.handler({
      items: [
        {
          content: 'Batch memory A',
          tags: ['test'],
          importance: 3,
          memory_type: 'plan',
        },
        {
          content: 'Batch memory B',
          tags: ['test'],
        },
      ],
    });
    assertOk(batch);

    const batchStructured = batch.structuredContent as {
      result: {
        results: Array<
          | { ok: true; hash: string; index: number; isNew: boolean }
          | { ok: false; error: string; index: number }
        >;
      };
    };
    const firstOk = batchStructured.result.results.find(
      (r): r is { ok: true; hash: string; index: number; isNew: boolean } =>
        r.ok === true
    );
    assert.ok(firstOk, 'Expected at least one successful batch store result');

    const fetchedBatchA = await getMemory.handler({ hash: firstOk.hash });
    assertOk(fetchedBatchA);
    assert.strictEqual(getImportance(fetchedBatchA), 3);
    assert.strictEqual(getMemoryType(fetchedBatchA), 'plan');

    const deleted = await deleteMemory.handler({ hash });
    assertOk(deleted);

    const missing = await deleteMemory.handler({ hash });
    assert.strictEqual(missing.isError, true);
    assert.match(JSON.stringify(missing.structuredContent), /E_NOT_FOUND/);
  });

  void it('accepts uppercase hashes for get/update/delete and delete_memories', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const getMemory = getTool(registrations, 'get_memory');
    const update = getTool(registrations, 'update_memory');
    const deleteMemory = getTool(registrations, 'delete_memory');
    const deleteMemories = getTool(registrations, 'delete_memories');

    const storedA = await store.handler({
      content: 'Uppercase hash test A',
      tags: ['test'],
    });
    assertOk(storedA);

    const upperHashA = getHash(storedA).toUpperCase();

    const fetchedA = await getMemory.handler({ hash: upperHashA });
    assertOk(fetchedA);

    const updatedA = await update.handler({
      hash: upperHashA,
      content: 'Uppercase hash updated content',
    });
    assertOk(updatedA);

    const updatedResult = updatedA.structuredContent as {
      result: { newHash: string };
    };
    const upperNewHash = updatedResult.result.newHash.toUpperCase();

    const deletedA = await deleteMemory.handler({ hash: upperNewHash });
    assertOk(deletedA);

    const storedB = await store.handler({
      content: 'Uppercase hash test B',
      tags: ['test'],
    });
    assertOk(storedB);

    const upperHashB = getHash(storedB).toUpperCase();
    const deletedB = await deleteMemories.handler({ hashes: [upperHashB] });
    assertOk(deletedB);

    const deletedBatchResult = deletedB.structuredContent as {
      result: { succeeded: number; failed: number };
    };
    assert.strictEqual(deletedBatchResult.result.succeeded, 1);
    assert.strictEqual(deletedBatchResult.result.failed, 0);
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
      tags: ['testtag', 'othertag'],
    });
    assertOk(stored);
    const hash = getHash(stored);

    const searched = await search.handler({ query: 'Searchable' });
    assertOk(searched);

    const searchStructured = searched.structuredContent as {
      result: Array<{ hash: string; tags: string[] }>;
    };
    const found = searchStructured.result.find((r) => r.hash === hash);
    assert.ok(found, 'Expected to find stored memory in results');
    assert.deepStrictEqual(found.tags, ['othertag', 'testtag']);

    const updated = await update.handler({ hash, content: 'Updated memory' });
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

void describe('tools responses recall', () => {
  void it('returns empty recall results when no memories match', async () => {
    const registrations = setupRegistrations();
    const recall = getTool(registrations, 'recall');

    const result = await recall.handler({
      query: 'no-matches-expected',
      depth: 2,
    });
    assertOk(result);

    const structured = result.structuredContent as {
      result: { memories: unknown[]; relationships: unknown[]; depth: number };
    };

    assert.deepStrictEqual(structured.result.memories, []);
    assert.deepStrictEqual(structured.result.relationships, []);
    assert.strictEqual(structured.result.depth, 2);
  });

  void it('supports recall at depth 0 and depth 1', async () => {
    const registrations = setupRegistrations();

    const store = getTool(registrations, 'store_memory');
    const createRelationship = getTool(registrations, 'create_relationship');
    const recall = getTool(registrations, 'recall');

    const storedA = await store.handler({
      content: 'Graph recall A',
      tags: ['graph'],
    });
    assertOk(storedA);
    const hashA = getHash(storedA);

    const storedB = await store.handler({
      content: 'Graph recall B',
      tags: ['graph'],
    });
    assertOk(storedB);
    const hashB = getHash(storedB);

    const created = await createRelationship.handler({
      from_hash: hashA,
      to_hash: hashB,
      relation_type: 'related_to',
    });
    assertOk(created);

    const depthZero = await recall.handler({ query: 'graph', depth: 0 });
    assertOk(depthZero);
    const depthZeroStructured = depthZero.structuredContent as {
      result: {
        memories: Array<{ hash: string }>;
        relationships: unknown[];
        depth: number;
      };
    };
    assert.strictEqual(depthZeroStructured.result.depth, 0);
    assert.deepStrictEqual(depthZeroStructured.result.relationships, []);
    assert.ok(
      depthZeroStructured.result.memories.some((m) => m.hash === hashA),
      'Expected depth=0 recall to include memory A'
    );
    assert.ok(
      depthZeroStructured.result.memories.some((m) => m.hash === hashB),
      'Expected depth=0 recall to include memory B'
    );

    const depthOne = await recall.handler({ query: 'graph', depth: 1 });
    assertOk(depthOne);

    const depthOneStructured = depthOne.structuredContent as {
      result: {
        memories: Array<{ hash: string }>;
        relationships: Array<{
          from_hash: string;
          to_hash: string;
          relation_type: string;
        }>;
        depth: number;
      };
    };
    assert.strictEqual(depthOneStructured.result.depth, 1);

    assert.ok(
      depthOneStructured.result.memories.some((m) => m.hash === hashA),
      'Expected depth=1 recall to include memory A'
    );
    assert.ok(
      depthOneStructured.result.memories.some((m) => m.hash === hashB),
      'Expected depth=1 recall to include memory B'
    );

    const relationship = depthOneStructured.result.relationships.find(
      (r) =>
        r.relation_type === 'related_to' &&
        r.from_hash === hashA &&
        r.to_hash === hashB
    );
    assert.ok(
      relationship,
      'Expected relationship to be included in depth=1 recall'
    );
  });
});

void describe('tools responses stats', () => {
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
