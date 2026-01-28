import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb, initDb } = await import('../src/core/db.js');
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
}

const search = (input: SearchInput): ReturnType<typeof searchMemories> =>
  searchMemories({
    query: input.query,
  });

before(async () => {
  await initDb();
});

after(() => {
  closeDb();
});

void describe('MemoryService tags association', () => {
  void it('should find memories by searching tags', () => {
    const content = 'Tagged content';
    const { hash } = create({ content, tags: ['important', 'work'] });

    const results = search({ query: 'important' });
    assert.ok(results.length >= 1, 'Should find at least one result');
    const found = results.find((r) => r.hash === hash);
    assert.ok(found, 'Expected to find tagged memory');
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
    assert.throws(
      () => create({ content: 'invalid tag', tags: ['has space'] }),
      /whitespace/i
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
    const { hash: oldHash } = create({
      content: 'With tags to keep',
      tags: ['keeptag'],
    });

    const result = updateMemory(oldHash, { content: 'New content with tags' });

    const results = search({ query: 'keeptag' });
    const found = results.find((r) => r.hash === result.newHash);
    assert.ok(found, 'Expected result with preserved tag');
  });

  void it('replaces tags when specified', () => {
    const { hash: oldHash } = create({
      content: 'Tag replace test',
      tags: ['oldtag'],
    });

    const result = updateMemory(oldHash, {
      content: 'Tag replace updated',
      tags: ['newtag'],
    });

    const oldResults = search({ query: 'oldtag' });
    const hasOld = oldResults.some((r) => r.hash === result.newHash);
    assert.strictEqual(hasOld, false, 'Should not find by old tag');

    const newResults = search({ query: 'newtag' });
    const hasNew = newResults.some((r) => r.hash === result.newHash);
    assert.strictEqual(hasNew, true, 'Should find by new tag');
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
