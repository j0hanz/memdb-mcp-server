import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/database.js');
const { createMemory } = await import('../src/core/memory-create.js');
const { getRelated, linkMemories } =
  await import('../src/core/memory-relations.js');

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

interface RelatedInput {
  hash: string;
  relationType?: string;
  depth?: number;
  direction?: 'outgoing' | 'incoming' | 'both';
}

const related = (input: RelatedInput): ReturnType<typeof getRelated> =>
  getRelated({
    hash: input.hash,
    relationType: input.relationType,
    depth: input.depth ?? 1,
    direction: input.direction ?? 'outgoing',
  });

afterTest(() => {
  closeDb();
});

describeTest('MemoryService relationships linking', () => {
  itTest('should link two memories', () => {
    const content1 = 'Source memory for relationship';
    const content2 = 'Target memory for relationship';
    const { hash: hash1 } = create({ content: content1 });
    const { hash: hash2 } = create({ content: content2 });

    linkMemories(hash1, hash2, 'related_to');

    const relatedMemories = related({
      hash: hash1,
      relationType: 'related_to',
    });
    assert.ok(relatedMemories.length > 0, 'Should find related memory');
    const first = relatedMemories[0];
    assert.ok(first, 'Expected related memory');
    assert.strictEqual(first.hash, hash2);
    assert.strictEqual(first.relation_type, 'related_to');
  });

  itTest('should throw when linking missing memories', () => {
    assert.throws(
      () => linkMemories('missing_hash_a', 'missing_hash_b', 'related_to'),
      /not found/i
    );
  });
});

describeTest('MemoryService relationships traversal', () => {
  itTest('should traverse related memories with depth > 1', () => {
    const { hash: rootHash } = create({ content: 'Root memory' });
    const { hash: midHash } = create({ content: 'Mid memory' });
    const { hash: leafHash } = create({ content: 'Leaf memory' });

    linkMemories(rootHash, midHash, 'related_to');
    linkMemories(midHash, leafHash, 'related_to');

    const direct = related({ hash: rootHash });
    assert.ok(direct.length > 0, 'Should return direct related memories');

    const recursive = related({
      hash: rootHash,
      relationType: 'related_to',
      depth: 2,
    });
    assert.ok(
      recursive.some((memory) => memory.hash === leafHash),
      'Should include depth=2 related memory'
    );
  });
});

describeTest('MemoryService relationships incoming', () => {
  itTest('should find incoming relationships', () => {
    const { hash: sourceHash } = create({ content: 'Incoming source memory' });
    const { hash: targetHash } = create({ content: 'Incoming target memory' });

    linkMemories(sourceHash, targetHash, 'points_to');

    const incoming = related({
      hash: targetHash,
      relationType: 'points_to',
      direction: 'incoming',
    });
    assert.ok(incoming.length > 0, 'Should find incoming relationship');
    const first = incoming[0];
    assert.ok(first, 'Expected incoming relationship');
    assert.strictEqual(first.hash, sourceHash);
  });
});

describeTest('MemoryService relationships bidirectional', () => {
  itTest('should find bidirectional relationships', () => {
    const { hash: centerHash } = create({
      content: 'Center memory for bidirectional',
    });
    const { hash: outHash } = create({ content: 'Outgoing target memory' });
    const { hash: inHash } = create({ content: 'Incoming source memory' });

    linkMemories(centerHash, outHash, 'links_out');
    linkMemories(inHash, centerHash, 'links_in');

    const both = related({ hash: centerHash, direction: 'both' });
    assert.ok(both.length >= 2, 'Should find both incoming and outgoing');
    assert.ok(
      both.some((memory) => memory.hash === outHash),
      'Should include outgoing target'
    );
    assert.ok(
      both.some((memory) => memory.hash === inHash),
      'Should include incoming source'
    );
  });
});

describeTest('MemoryService relationships depth cap', () => {
  itTest('should cap depth at 2 for bidirectional queries', () => {
    const { hash: h1 } = create({ content: 'Depth cap test 1' });
    const { hash: h2 } = create({ content: 'Depth cap test 2' });
    const { hash: h3 } = create({ content: 'Depth cap test 3' });
    const { hash: h4 } = create({ content: 'Depth cap test 4' });

    linkMemories(h1, h2, 'chain');
    linkMemories(h2, h3, 'chain');
    linkMemories(h3, h4, 'chain');

    const results = related({
      hash: h1,
      relationType: 'chain',
      depth: 3,
      direction: 'both',
    });
    assert.ok(
      results.some((memory) => memory.hash === h2),
      'Should find depth 1'
    );
    assert.ok(
      results.some((memory) => memory.hash === h3),
      'Should find depth 2'
    );
    assert.ok(
      !results.some((memory) => memory.hash === h4),
      'Should NOT find depth 3 (capped)'
    );
  });
});

describeTest('MemoryService relationships unicode', () => {
  itTest('should handle unicode in relationship types', () => {
    const { hash: h1 } = create({ content: 'Unicode relation source' });
    const { hash: h2 } = create({ content: 'Unicode relation target' });

    linkMemories(h1, h2, '関連する');

    const relatedMemories = related({ hash: h1, relationType: '関連する' });
    assert.ok(relatedMemories.length > 0, 'Should find unicode relationship');
    const first = relatedMemories[0];
    assert.ok(first, 'Expected unicode relationship');
    assert.strictEqual(first.relation_type, '関連する');
  });
});
