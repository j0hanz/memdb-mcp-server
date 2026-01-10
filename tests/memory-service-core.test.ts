import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/db.js');
const { createMemory } = await import('../src/core/memory-write.js');
const { deleteMemory, getMemory } = await import('../src/core/memory-read.js');
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

after(() => {
  closeDb();
});

void describe('MemoryService createMemory', () => {
  void it('should create a memory with valid hash', () => {
    const content = 'Test memory content';
    const result = create({
      content,
      tags: [],
    });

    assert.ok(result.id > 0, 'Should return valid ID');
    assert.strictEqual(
      result.hash.length,
      32,
      'MD5 hash should be 32 characters'
    );
    assert.strictEqual(result.isNew, true, 'Should be new memory');
  });

  void it('should generate consistent hash for same content', () => {
    const content = 'Reproducible content';
    const result1 = create({ content });
    const result2 = create({ content });

    assert.strictEqual(
      result1.hash,
      result2.hash,
      'Same content should produce same hash'
    );
    assert.strictEqual(result2.isNew, false, 'Second insert should not be new');
  });
});

void describe('MemoryService getMemory', () => {
  void it('should retrieve memory by hash', () => {
    const content = 'Retrievable content';
    const { hash } = create({ content });

    const memory = getMemory(hash);

    assert.ok(memory, 'Memory should be found');
    assert.strictEqual(memory.content, content);
    assert.strictEqual(memory.hash, hash);
  });

  void it('should return undefined for non-existent hash', () => {
    const memory = getMemory('nonexistent_hash_value');

    assert.strictEqual(
      memory,
      undefined,
      'Should return undefined for missing memory'
    );
  });
});

void describe('MemoryService searchMemories (FTS5)', () => {
  void it('should find memories matching content', () => {
    const content = 'TypeScript programming language guide';
    create({ content });

    const results = search({ query: 'TypeScript' });

    assert.ok(results.length > 0, 'Should find at least one result');
    const first = results[0];
    assert.ok(first, 'Expected at least one result');
    assert.ok(
      first.content.includes('TypeScript'),
      'Result should contain search term'
    );
  });

  void it('should find memories by tag search', () => {
    create({ content: 'Memory with special tag', tags: ['uniquetag123'] });

    const results = search({ query: 'uniquetag123' });
    assert.ok(results.length > 0, 'Should find memory by tag');
    const first = results[0];
    assert.ok(first, 'Expected tagged result');
    assert.strictEqual(first.content, 'Memory with special tag');
  });

  void it('should find memories matching either content or tags', () => {
    create({ content: 'Has content match', tags: ['othertag'] });
    create({ content: 'Has tag match', tags: ['searchterm'] });

    const results = search({ query: 'searchterm' });
    assert.ok(results.length >= 1, 'Should find at least one result');
  });
});

void describe('MemoryService deleteMemory', () => {
  void it('should delete memory by hash', () => {
    const content = 'Content to delete';
    const { hash } = create({ content });

    const result = deleteMemory(hash);

    assert.strictEqual(result.changes, 1, 'Should delete exactly one row');

    const deleted = getMemory(hash);
    assert.strictEqual(deleted, undefined, 'Memory should be deleted');
  });
});
