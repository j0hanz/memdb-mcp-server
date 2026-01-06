import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/database.js');
const { createMemory, getMemory, searchMemories, updateMemory } =
  await import('../src/core/memory-service.js');

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

const afterTest = (fn: () => void): void => {
  after(fn);
};

interface CreateInput {
  content: string;
  tags?: readonly string[];
  importance?: number;
  memoryType?: string;
}

const create = (input: CreateInput): ReturnType<typeof createMemory> =>
  createMemory({
    content: input.content,
    tags: input.tags ?? [],
    importance: input.importance ?? 0,
    memoryType: input.memoryType ?? 'general',
  });

interface SearchInput {
  query: string;
  limit?: number;
  tags?: readonly string[];
  minRelevance?: number;
  offset?: number;
}

const search = (input: SearchInput): ReturnType<typeof searchMemories> =>
  searchMemories({
    query: input.query,
    limit: input.limit ?? 10,
    tags: input.tags ?? [],
    minRelevance: input.minRelevance,
    offset: input.offset,
  });

afterTest(() => {
  closeDb();
});

describeTest('MemoryService tags association', () => {
  itTest('should associate tags with memories', () => {
    const content = 'Tagged content';
    const { hash } = create({ content, tags: ['important', 'work'] });

    const results = search({ query: 'Tagged', limit: 10, tags: ['important'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected tag search result');
    assert.strictEqual(first.hash, hash);
  });
});

describeTest('MemoryService tags validation', () => {
  itTest('should reject invalid tag inputs', () => {
    assert.throws(
      () =>
        create({
          content: 'invalid tags',
          tags: Array.from({ length: 101 }, () => 't'),
        }),
      /Too many tags/i
    );
    assert.throws(
      () => create({ content: 'invalid tag', tags: [''] }),
      /at least 1 character/i
    );
    assert.throws(
      () => create({ content: 'invalid tag', tags: ['x'.repeat(51)] }),
      /exceeds 50 characters/i
    );
  });
});

describeTest('MemoryService updateMemory metadata', () => {
  itTest('updates importance and memory type', () => {
    const { hash } = create({ content: 'Metadata update target' });

    updateMemory(hash, { importance: 7, memoryType: 'note' });

    const updated = getMemory(hash);
    assert.ok(updated, 'Memory should exist after update');
    assert.strictEqual(updated.importance, 7);
    assert.strictEqual(updated.memory_type, 'note');
  });
});

describeTest('MemoryService updateMemory tags', () => {
  itTest('replaces tags when tags are provided', () => {
    const { hash } = create({ content: 'Replace tags', tags: ['old'] });

    updateMemory(hash, { tags: ['new'] });

    const results = search({ query: 'Replace', tags: ['new'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected replaced tag result');
    assert.strictEqual(first.hash, hash);
  });

  itTest('removes tags when removeTags is provided', () => {
    const { hash } = create({ content: 'Remove tags', tags: ['gone'] });

    updateMemory(hash, { removeTags: ['gone'] });

    const results = search({ query: 'Remove', tags: ['gone'] });
    assert.strictEqual(results.length, 0);
  });
});

describeTest('MemoryService updateMemory tag limits', () => {
  itTest('enforces tag cap when adding tags via updateMemory', () => {
    const tags = Array.from(
      { length: 100 },
      (_, index) => `tag-${String(index)}`
    );
    const { hash } = create({ content: 'Tag limit memory add', tags });

    assert.throws(
      () => updateMemory(hash, { addTags: ['extra'] }),
      /Too many tags/i
    );
  });

  itTest('allows add/remove to stay within tag cap', () => {
    const tags = Array.from(
      { length: 100 },
      (_, index) => `cap-${String(index)}`
    );
    const { hash } = create({ content: 'Tag limit memory swap', tags });

    assert.doesNotThrow(() =>
      updateMemory(hash, { addTags: ['extra'], removeTags: ['cap-0'] })
    );
  });
});
