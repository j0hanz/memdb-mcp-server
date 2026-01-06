import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

process.env.MEMDB_PATH = ':memory:';

const { closeDb } = await import('../src/core/database.js');
const { getStats } = await import('../src/core/memory-service.js');

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

const afterTest = (fn: () => void): void => {
  after(fn);
};

afterTest(() => {
  closeDb();
});

describeTest('MemoryService stats', () => {
  itTest('should return memory and relationship counts', () => {
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
