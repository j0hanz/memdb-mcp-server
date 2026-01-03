import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDbPath, resolveLogLevel } from '../src/utils/config.js';

describe('config', () => {
  it('rejects invalid log level', () => {
    assert.throws(
      () => resolveLogLevel(undefined, 'debug'),
      /Invalid log level/i
    );
  });

  it('accepts default log level when unspecified', () => {
    assert.strictEqual(resolveLogLevel(undefined, undefined), 'info');
  });

  it('rejects database path containing null byte', () => {
    assert.throws(
      () => resolveDbPath(undefined, false, 'bad\0path'),
      /null byte/i
    );
  });

  it('allows memory mode regardless of env path', () => {
    assert.strictEqual(resolveDbPath(undefined, true, 'bad\0path'), ':memory:');
  });
});
