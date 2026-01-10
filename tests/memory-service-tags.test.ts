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
}

const create = (input: CreateInput): ReturnType<typeof createMemory> =>
  createMemory({
    content: input.content,
    tags: input.tags ?? [],
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

void describe('MemoryService updateMemory content', () => {
  void it('updates content and returns new hash', () => {
    const { hash: oldHash } = create({ content: 'Original content' });

    const result = updateMemory(oldHash, { content: 'Updated content' });

    assert.strictEqual(result.updated, true);
    assert.strictEqual(result.oldHash, oldHash);
    assert.notStrictEqual(result.newHash, oldHash);

    const updated = getMemory(result.newHash);
    assert.ok(updated, 'Memory should exist with new hash');
    assert.strictEqual(updated.content, 'Updated content');

    const old = getMemory(oldHash);
    assert.strictEqual(old, undefined, 'Old hash should not exist');
  });

  void it('preserves tags when not specified', () => {
    const { hash: oldHash } = create({ content: 'With tags', tags: ['keep'] });

    const result = updateMemory(oldHash, { content: 'New content' });

    const results = search({ query: 'New content', tags: ['keep'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected result with preserved tag');
    assert.strictEqual(first.hash, result.newHash);
  });

  void it('replaces tags when specified', () => {
    const { hash: oldHash } = create({ content: 'Tag replace', tags: ['old'] });

    updateMemory(oldHash, { content: 'Tag replace updated', tags: ['new'] });

    const oldResults = search({ query: 'Tag replace', tags: ['old'] });
    assert.strictEqual(oldResults.length, 0);

    const newResults = search({ query: 'Tag replace', tags: ['new'] });
    assert.strictEqual(newResults.length, 1);
  });

  void it('rejects update if new content already exists', () => {
    create({ content: 'Existing content' });
    const { hash } = create({ content: 'To be updated' });

    assert.throws(
      () => updateMemory(hash, { content: 'Existing content' }),
      /already exists/i
    );
  });
});
