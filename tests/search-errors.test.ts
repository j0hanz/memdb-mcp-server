import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchError } from '../src/core/search-errors.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

describeTest('search-errors', () => {
  itTest('maps missing index errors', () => {
    const error = toSearchError(new Error('no such table: memories_fts'));
    assert.ok(error, 'Expected mapped error');
    assert.match(error.message, /Search index unavailable/i);
  });

  itTest('maps invalid query errors', () => {
    const error = toSearchError(new Error('fts5: syntax error'));
    assert.ok(error, 'Expected mapped error');
    assert.match(error.message, /Invalid search query syntax/i);
  });

  itTest('ignores unrelated errors', () => {
    const error = toSearchError(new Error('other error'));
    assert.strictEqual(error, undefined);
  });
});
