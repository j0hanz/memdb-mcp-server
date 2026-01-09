import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchError } from '../src/core/search.js';

void describe('search-errors', () => {
  void it('maps missing index errors', () => {
    const error = toSearchError(new Error('no such table: memories_fts'));
    assert.ok(error, 'Expected mapped error');
    assert.match(error.message, /Search index unavailable/i);
  });

  void it('maps invalid query errors', () => {
    const error = toSearchError(new Error('fts5: syntax error'));
    assert.ok(error, 'Expected mapped error');
    assert.match(error.message, /Invalid search query syntax/i);
  });

  void it('ignores unrelated errors', () => {
    const error = toSearchError(new Error('other error'));
    assert.strictEqual(error, undefined);
  });
});
