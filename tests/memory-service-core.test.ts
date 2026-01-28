import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb, withImmediateTransaction } = await import('../src/core/db.js');
const { createMemory, createMemories } =
  await import('../src/core/memory-write.js');
const { deleteMemory, deleteMemories, getMemory } =
  await import('../src/core/memory-read.js');
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
      64,
      'SHA256 hash should be 64 characters'
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

void describe('withImmediateTransaction', () => {
  void it('should throw on nested transaction attempt', () => {
    assert.throws(
      () => {
        withImmediateTransaction(() => {
          withImmediateTransaction(() => {});
        });
      },
      /nested transaction/i,
      'Should reject nested transactions'
    );
  });
});

void describe('MemoryService createMemories (batch)', () => {
  void it('should create multiple memories successfully', () => {
    const items = [
      { content: 'Batch item 1', tags: ['batch', 'test'] },
      { content: 'Batch item 2', tags: ['batch', 'second'] },
      { content: 'Batch item 3', tags: ['batch', 'third'] },
    ];

    const result = createMemories(items);

    assert.strictEqual(result.succeeded, 3, 'Should succeed for all items');
    assert.strictEqual(result.failed, 0, 'Should have no failures');
    assert.strictEqual(result.results.length, 3, 'Should return 3 results');

    for (const r of result.results) {
      assert.ok(r.hash, 'Each result should have a hash');
      assert.ok(r.isNew !== undefined, 'Each result should have isNew');
      assert.strictEqual(r.error, undefined, 'Should have no error');
    }
  });

  void it('should return partial success on tag validation errors', () => {
    const items = [
      { content: 'Valid content for tag test 1', tags: ['valid'] },
      { content: 'Invalid tags content', tags: ['a'.repeat(51)] }, // Tag too long (>50 chars)
      { content: 'Valid content for tag test 2', tags: ['valid'] },
    ];

    const result = createMemories(items);

    assert.strictEqual(result.succeeded, 2, 'Should succeed for 2 items');
    assert.strictEqual(result.failed, 1, 'Should fail for 1 item');
    assert.strictEqual(result.results.length, 3, 'Should return all results');

    // Check that the middle item has an error
    const failedResult = result.results[1];
    assert.ok(failedResult, 'Should have result at index 1');
    assert.ok(failedResult.error, 'Failed item should have error');
    assert.ok(
      failedResult.error.includes('50'),
      'Error should mention tag length limit'
    );
  });

  void it('should handle empty array', () => {
    const result = createMemories([]);

    assert.strictEqual(result.succeeded, 0, 'Should have 0 succeeded');
    assert.strictEqual(result.failed, 0, 'Should have 0 failed');
    assert.strictEqual(result.results.length, 0, 'Should return empty array');
  });

  void it('should deduplicate content across batch', () => {
    const items = [
      { content: 'Duplicate batch content', tags: ['first'] },
      { content: 'Duplicate batch content', tags: ['second'] },
    ];

    const result = createMemories(items);

    assert.strictEqual(result.succeeded, 2, 'Both should succeed');
    assert.strictEqual(
      result.results[0]?.hash,
      result.results[1]?.hash,
      'Same content should produce same hash'
    );
    assert.strictEqual(result.results[0]?.isNew, true, 'First should be new');
    assert.strictEqual(
      result.results[1]?.isNew,
      false,
      'Second should not be new'
    );
  });
});

void describe('MemoryService deleteMemories (batch)', () => {
  void it('should delete multiple memories successfully', () => {
    // Create test memories
    const mem1 = createMemory({
      content: 'To delete batch 1',
      tags: ['delete-batch'],
    });
    const mem2 = createMemory({
      content: 'To delete batch 2',
      tags: ['delete-batch'],
    });
    const mem3 = createMemory({
      content: 'To delete batch 3',
      tags: ['delete-batch'],
    });

    const result = deleteMemories([mem1.hash, mem2.hash, mem3.hash]);

    assert.strictEqual(result.succeeded, 3, 'Should delete all 3');
    assert.strictEqual(result.failed, 0, 'Should have no failures');

    for (const r of result.results) {
      assert.strictEqual(r.deleted, true, 'Each should be deleted');
    }

    // Verify memories are gone
    assert.strictEqual(getMemory(mem1.hash), undefined);
    assert.strictEqual(getMemory(mem2.hash), undefined);
    assert.strictEqual(getMemory(mem3.hash), undefined);
  });

  void it('should return partial success with non-existent hashes', () => {
    const mem = createMemory({
      content: 'To delete for partial',
      tags: ['delete-test'],
    });

    const result = deleteMemories([
      mem.hash,
      'nonexistent1234567890123456789012',
      'anotherfake12345678901234567890',
    ]);

    assert.strictEqual(result.succeeded, 1, 'Should delete 1');
    assert.strictEqual(result.failed, 2, 'Should fail for 2');
    assert.strictEqual(result.results[0]?.deleted, true);
    assert.strictEqual(result.results[1]?.deleted, false);
    assert.strictEqual(result.results[2]?.deleted, false);
  });

  void it('should handle empty array', () => {
    const result = deleteMemories([]);

    assert.strictEqual(result.succeeded, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.results.length, 0);
  });
});
