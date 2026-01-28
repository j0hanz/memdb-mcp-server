import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Use in-memory database for tests
process.env.MEMDB_PATH = ':memory:';

const { initDb, closeDb } = await import('../src/core/db.js');
const { createMemory } = await import('../src/core/memory-write.js');
const { searchMemories, recallMemories } =
  await import('../src/core/search.js');

void describe('AbortSignal support', () => {
  before(() => initDb());
  after(() => closeDb());

  void it('operations accept AbortSignal parameter', async () => {
    // Create test data
    await createMemory({ content: 'Test memory for signal', tags: ['test'] });

    // Create a signal (not aborted)
    const controller = new AbortController();

    // Operations should accept signal parameter without error
    const searchResults = searchMemories({ query: 'test' }, controller.signal);
    assert.ok(
      searchResults.length > 0,
      'Search should return results with signal'
    );

    const recallResults = recallMemories(
      { query: 'test', depth: 0 },
      controller.signal
    );
    assert.ok(
      recallResults.memories.length > 0,
      'Recall should return results with signal'
    );
  });

  void it('operations work without AbortSignal', async () => {
    // Create test data
    await createMemory({
      content: 'Normal operation test',
      tags: ['normal'],
    });

    // Operations without signal should work normally
    const searchResults = searchMemories({ query: 'normal' });
    assert.ok(searchResults.length > 0, 'Search should return results');

    const recallResults = recallMemories({ query: 'normal', depth: 0 });
    assert.ok(
      recallResults.memories.length > 0,
      'Recall should return results'
    );
  });

  void it('signal checks are properly placed in operations', async () => {
    // Verify throwIfAborted is available in this Node version
    const controller = new AbortController();
    const hasThrowIfAborted =
      typeof controller.signal.throwIfAborted === 'function';

    if (hasThrowIfAborted) {
      // Create test data
      await createMemory({ content: 'Test abort', tags: ['abort-test'] });

      // Create an already-aborted signal
      controller.abort();

      // Operations should throw when signal is aborted
      assert.throws(
        () => searchMemories({ query: 'abort-test' }, controller.signal),
        'Expected searchMemories to throw when signal is aborted'
      );
    } else {
      // Skip abort test if throwIfAborted not available
      console.log(
        '  ⚠ Skipping abort throw test (throwIfAborted not available in this Node version)'
      );
    }
  });
});
