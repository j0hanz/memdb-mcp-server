import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

// Set environment to use in-memory database before imports
process.env.MEMDB_PATH = ':memory:';

const { closeDb, db } = await import('../src/core/database.js');
const {
  createMemory,
  deleteMemory,
  getMemory,
  getRelated,
  getStats,
  linkMemories,
  searchMemories,
  updateMemory,
} = await import('../src/core/memory-service.js');

describe('MemoryService', () => {
  after(() => {
    closeDb();
  });

  describe('createMemory', () => {
    it('should create a memory with valid hash', () => {
      const content = 'Test memory content';
      const result = createMemory(content, [], 5, 'fact');

      assert.ok(result.id > 0, 'Should return valid ID');
      assert.strictEqual(
        result.hash.length,
        32,
        'MD5 hash should be 32 characters'
      );
      assert.strictEqual(result.isNew, true, 'Should be new memory');
    });

    it('should generate consistent hash for same content', () => {
      const content = 'Reproducible content';
      const result1 = createMemory(content);
      const result2 = createMemory(content);

      assert.strictEqual(
        result1.hash,
        result2.hash,
        'Same content should produce same hash'
      );
      assert.strictEqual(
        result2.isNew,
        false,
        'Second insert should not be new'
      );
    });
  });

  describe('getMemory', () => {
    it('should retrieve memory by hash', () => {
      const content = 'Retrievable content';
      const { hash } = createMemory(content, [], 3, 'note');

      const memory = getMemory(hash);

      assert.ok(memory, 'Memory should be found');
      assert.strictEqual(memory.content, content);
      assert.strictEqual(memory.hash, hash);
    });

    it('should return undefined for non-existent hash', () => {
      const memory = getMemory('nonexistent_hash_value');

      assert.strictEqual(
        memory,
        undefined,
        'Should return undefined for missing memory'
      );
    });
  });

  describe('searchMemories (FTS5)', () => {
    it('should find memories matching search query', () => {
      const content = 'TypeScript programming language guide';
      createMemory(content, [], 5, 'guide');

      const results = searchMemories('TypeScript');

      assert.ok(results.length > 0, 'Should find at least one result');
      assert.ok(
        results[0]?.content.includes('TypeScript'),
        'Result should contain search term'
      );
    });

    it('should filter by tags', () => {
      createMemory('Tagged memory 1', ['tag1']);
      createMemory('Tagged memory 2', ['tag2']);

      const results = searchMemories('Tagged', 10, ['tag1']);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]?.content, 'Tagged memory 1');
    });

    it('should reject too many search tags', () => {
      assert.throws(
        () =>
          searchMemories(
            'Tagged',
            10,
            Array.from({ length: 51 }, () => 'tag')
          ),
        /Too many tags/i
      );
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory by hash', () => {
      const content = 'Content to delete';
      const { hash } = createMemory(content);

      const result = deleteMemory(hash);

      assert.strictEqual(result.changes, 1, 'Should delete exactly one row');

      const deleted = getMemory(hash);
      assert.strictEqual(deleted, undefined, 'Memory should be deleted');
    });
  });

  describe('tags', () => {
    it('should associate tags with memories', () => {
      const content = 'Tagged content';
      const { hash } = createMemory(content, ['important', 'work']);

      // We don't have a direct getTags function, but search should work
      const results = searchMemories('Tagged', 10, ['important']);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0]?.hash, hash);
    });

    it('should reject invalid tag inputs', () => {
      assert.throws(
        () =>
          createMemory(
            'invalid tags',
            Array.from({ length: 101 }, () => 't')
          ),
        /Too many tags/i
      );
      assert.throws(
        () => createMemory('invalid tag', ['']),
        /at least 1 character/i
      );
      assert.throws(
        () => createMemory('invalid tag', ['x'.repeat(51)]),
        /exceeds 50 characters/i
      );
    });

    it('should enforce tag cap when adding tags via updateMemory', () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag-${i}`);
      const { hash } = createMemory('Tag limit memory add', tags);

      assert.throws(
        () => updateMemory(hash, { addTags: ['extra'] }),
        /Too many tags/i
      );
    });

    it('should allow add/remove to stay within tag cap', () => {
      const tags = Array.from({ length: 100 }, (_, i) => `cap-${i}`);
      const { hash } = createMemory('Tag limit memory swap', tags);

      assert.doesNotThrow(() =>
        updateMemory(hash, { addTags: ['extra'], removeTags: ['cap-0'] })
      );
    });
  });

  describe('relationships', () => {
    it('should link two memories', () => {
      const content1 = 'Source memory for relationship';
      const content2 = 'Target memory for relationship';
      const { hash: hash1 } = createMemory(content1);
      const { hash: hash2 } = createMemory(content2);

      linkMemories(hash1, hash2, 'related_to');

      const related = getRelated(hash1, 'related_to');
      assert.ok(related.length > 0, 'Should find related memory');
      assert.strictEqual(related[0]?.hash, hash2);
      assert.strictEqual(related[0]?.relation_type, 'related_to');
    });

    it('should throw when linking missing memories', () => {
      assert.throws(
        () => linkMemories('missing_hash_a', 'missing_hash_b', 'related_to'),
        /not found/i
      );
    });

    it('should traverse related memories with depth > 1', () => {
      const { hash: rootHash } = createMemory('Root memory');
      const { hash: midHash } = createMemory('Mid memory');
      const { hash: leafHash } = createMemory('Leaf memory');

      linkMemories(rootHash, midHash, 'related_to');
      linkMemories(midHash, leafHash, 'related_to');

      const direct = getRelated(rootHash);
      assert.ok(direct.length > 0, 'Should return direct related memories');

      const recursive = getRelated(rootHash, 'related_to', 2);
      assert.ok(
        recursive.some((memory) => memory.hash === leafHash),
        'Should include depth=2 related memory'
      );
    });

    it('should find incoming relationships', () => {
      const { hash: sourceHash } = createMemory('Incoming source memory');
      const { hash: targetHash } = createMemory('Incoming target memory');

      linkMemories(sourceHash, targetHash, 'points_to');

      // Query from target perspective (incoming direction)
      const incoming = getRelated(targetHash, 'points_to', 1, 'incoming');
      assert.ok(incoming.length > 0, 'Should find incoming relationship');
      assert.strictEqual(incoming[0]?.hash, sourceHash);
    });

    it('should find bidirectional relationships', () => {
      const { hash: centerHash } = createMemory(
        'Center memory for bidirectional'
      );
      const { hash: outHash } = createMemory('Outgoing target memory');
      const { hash: inHash } = createMemory('Incoming source memory');

      linkMemories(centerHash, outHash, 'links_out');
      linkMemories(inHash, centerHash, 'links_in');

      // Query both directions
      const both = getRelated(centerHash, undefined, 1, 'both');
      assert.ok(both.length >= 2, 'Should find both incoming and outgoing');
      assert.ok(
        both.some((m) => m.hash === outHash),
        'Should include outgoing target'
      );
      assert.ok(
        both.some((m) => m.hash === inHash),
        'Should include incoming source'
      );
    });

    it('should cap depth at 2 for bidirectional queries', () => {
      const { hash: h1 } = createMemory('Depth cap test 1');
      const { hash: h2 } = createMemory('Depth cap test 2');
      const { hash: h3 } = createMemory('Depth cap test 3');
      const { hash: h4 } = createMemory('Depth cap test 4');

      linkMemories(h1, h2, 'chain');
      linkMemories(h2, h3, 'chain');
      linkMemories(h3, h4, 'chain');

      // Request depth 3 with 'both' should be capped at 2
      const results = getRelated(h1, 'chain', 3, 'both');
      // Should find h2 (depth 1) and h3 (depth 2) but not h4 (depth 3)
      assert.ok(
        results.some((m) => m.hash === h2),
        'Should find depth 1'
      );
      assert.ok(
        results.some((m) => m.hash === h3),
        'Should find depth 2'
      );
      assert.ok(
        !results.some((m) => m.hash === h4),
        'Should NOT find depth 3 (capped)'
      );
    });

    it('should handle unicode in relationship types', () => {
      const { hash: h1 } = createMemory('Unicode relation source');
      const { hash: h2 } = createMemory('Unicode relation target');

      linkMemories(h1, h2, '関連する');

      const related = getRelated(h1, '関連する');
      assert.ok(related.length > 0, 'Should find unicode relationship');
      assert.strictEqual(related[0]?.relation_type, '関連する');
    });
  });

  describe('stats', () => {
    it('should return memory and relationship counts', () => {
      const stats = getStats();

      assert.ok(
        typeof stats.memoryCount === 'number',
        'Memory count should be a number'
      );
      assert.ok(
        typeof stats.relationshipCount === 'number',
        'Relationship count should be a number'
      );
      assert.ok(stats.memoryCount >= 0, 'Memory count should be non-negative');
      assert.ok(
        stats.relationshipCount >= 0,
        'Relationship count should be non-negative'
      );
    });
  });
});
