import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/db.js');
const { createMemory, updateMemory } =
  await import('../src/core/memory-write.js');
const { getMemory } = await import('../src/core/memory-read.js');
const { searchMemories } = await import('../src/core/search.js');

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
}

const search = (input: SearchInput): ReturnType<typeof searchMemories> =>
  searchMemories({
    query: input.query,
    limit: input.limit ?? 10,
    tags: input.tags ?? [],
  });

after(() => {
  closeDb();
});

void describe('MemoryService tags association', () => {
  void it('should associate tags with memories', () => {
    const content = 'Tagged content';
    const { hash } = create({ content, tags: ['important', 'work'] });

    const results = search({ query: 'Tagged', limit: 10, tags: ['important'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected tag search result');
    assert.strictEqual(first.hash, hash);
  });
});

void describe('MemoryService tags validation', () => {
  void it('should reject invalid tag inputs', () => {
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

void describe('MemoryService updateMemory metadata', () => {
  void it('updates importance and memory type', () => {
    const { hash } = create({ content: 'Metadata update target' });

    updateMemory(hash, { importance: 7, memoryType: 'note' });

    const updated = getMemory(hash);
    assert.ok(updated, 'Memory should exist after update');
    assert.strictEqual(updated.importance, 7);
    assert.strictEqual(updated.memory_type, 'note');
  });
});

void describe('MemoryService updateMemory tags', () => {
  void it('replaces tags when tags are provided', () => {
    const { hash } = create({ content: 'Replace tags', tags: ['old'] });

    updateMemory(hash, { tags: ['new'] });

    const results = search({ query: 'Replace', tags: ['new'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected replaced tag result');
    assert.strictEqual(first.hash, hash);
  });
});
