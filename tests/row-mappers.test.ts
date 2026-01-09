import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mapRowToMemory,
  mapRowToRelatedMemory,
  mapRowToSearchResult,
  toSafeInteger,
} from '../src/core/db.js';

void describe('row-mappers mapRowToMemory', () => {
  void it('maps rows with optional fields', () => {
    const baseRow = {
      id: 1n,
      content: 'content',
      summary: null,
      importance: 2,
      memory_type: 'general',
      created_at: '2025-01-01T00:00:00Z',
      accessed_at: '2025-01-02T00:00:00Z',
      hash: 'hash',
    };

    const memory = mapRowToMemory(baseRow);
    assert.strictEqual(memory.id, 1);
    assert.strictEqual(memory.summary, undefined);

    const searchResult = mapRowToSearchResult({
      ...baseRow,
      relevance: null,
    });
    assert.strictEqual(searchResult.relevance, 0);
  });
});

void describe('row-mappers mapRowToRelatedMemory', () => {
  void it('maps related rows', () => {
    const related = mapRowToRelatedMemory({
      id: 2,
      content: 'related',
      summary: 'summary',
      importance: 1,
      memory_type: 'note',
      created_at: '2025-01-01T00:00:00Z',
      accessed_at: '2025-01-02T00:00:00Z',
      hash: 'hash-2',
      relation_type: 'rel',
      depth: 2,
    });

    assert.strictEqual(related.relation_type, 'rel');
    assert.strictEqual(related.depth, 2);
  });
});

void describe('row-mappers toSafeInteger', () => {
  void it('rejects non-integer numbers', () => {
    assert.throws(() => toSafeInteger(1.5, 'id'), /Invalid id/);
  });
});
