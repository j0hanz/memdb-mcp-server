import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/db.js');
const { getStats } = await import('../src/core/memory-read.js');

after(() => {
  closeDb();
});

void describe('MemoryService stats', () => {
  void it('should return memory and tag counts', () => {
    const stats = getStats();

    assert.ok(
      typeof stats.memoryCount === 'number',
      'Memory count should be a number'
    );
    assert.ok(
      typeof stats.tagCount === 'number',
      'Tag count should be a number'
    );
    assert.ok(stats.memoryCount >= 0, 'Memory count should be non-negative');
    assert.ok(stats.tagCount >= 0, 'Tag count should be non-negative');
  });
});
