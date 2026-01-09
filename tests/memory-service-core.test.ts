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

after(() => {
  closeDb();
});

void describe('MemoryService createMemory', () => {
  void it('should create a memory with valid hash', () => {
    const content = 'Test memory content';
    const result = create({
      content,
      tags: [],
      importance: 5,
      memoryType: 'fact',
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
    const { hash } = create({ content, importance: 3, memoryType: 'note' });

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
  void it('should find memories matching search query', () => {
    const content = 'TypeScript programming language guide';
    create({ content, importance: 5, memoryType: 'guide' });

    const results = search({ query: 'TypeScript' });

    assert.ok(results.length > 0, 'Should find at least one result');
    const first = results[0];
    assert.ok(first, 'Expected at least one result');
    assert.ok(
      first.content.includes('TypeScript'),
      'Result should contain search term'
    );
  });

  void it('should filter by tags', () => {
    create({ content: 'Tagged memory 1', tags: ['tag1'] });
    create({ content: 'Tagged memory 2', tags: ['tag2'] });

    const results = search({ query: 'Tagged', limit: 10, tags: ['tag1'] });
    assert.strictEqual(results.length, 1);
    const first = results[0];
    assert.ok(first, 'Expected tagged result');
    assert.strictEqual(first.content, 'Tagged memory 1');
  });

  void it('should reject too many search tags', () => {
    assert.throws(
      () =>
        search({
          query: 'Tagged',
          limit: 10,
          tags: Array.from({ length: 51 }, () => 'tag'),
        }),
      /Too many tags/i
    );
  });
});

void describe('MemoryService searchMemories minRelevance', () => {
  void it('applies minRelevance filter path', () => {
    create({ content: 'Relevance probe alpha', tags: ['relevance'] });

    const results = search({
      query: 'Relevance',
      minRelevance: 0,
      tags: ['relevance'],
    });

    assert.ok(results.length >= 1, 'Should return filtered results');
  });
});

void describe('MemoryService searchMemories offset', () => {
  void it('applies offset for pagination', () => {
    create({ content: 'Offset sample one', tags: ['offset'] });
    create({ content: 'Offset sample two', tags: ['offset'] });

    const results = search({
      query: 'Offset',
      limit: 1,
      offset: 1,
      tags: ['offset'],
    });

    assert.strictEqual(results.length, 1);
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
