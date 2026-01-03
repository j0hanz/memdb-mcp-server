import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveDbPath,
  resolveLogLevel,
  resolveShutdownTimeout,
} from '../src/utils/config.js';

describe('config', () => {
  describe('resolveLogLevel', () => {
    it('rejects invalid log level', () => {
      assert.throws(
        () => resolveLogLevel(undefined, 'debug'),
        /Invalid log level/i
      );
    });

    it('accepts default log level when unspecified', () => {
      assert.strictEqual(resolveLogLevel(undefined, undefined), 'info');
    });
  });

  describe('resolveDbPath', () => {
    it('rejects database path containing null byte', () => {
      assert.throws(
        () => resolveDbPath(undefined, false, 'bad\0path'),
        /null byte/i
      );
    });

    it('allows memory mode regardless of env path', () => {
      assert.strictEqual(
        resolveDbPath(undefined, true, 'bad\0path'),
        ':memory:'
      );
    });
  });

  describe('resolveShutdownTimeout', () => {
    it('returns default timeout when unspecified', () => {
      assert.strictEqual(resolveShutdownTimeout(undefined, undefined), 5000);
    });

    it('accepts valid timeout from CLI', () => {
      assert.strictEqual(resolveShutdownTimeout('10000', undefined), 10000);
    });

    it('accepts valid timeout from env', () => {
      assert.strictEqual(resolveShutdownTimeout(undefined, '15000'), 15000);
    });

    it('CLI takes precedence over env', () => {
      assert.strictEqual(resolveShutdownTimeout('8000', '12000'), 8000);
    });

    it('accepts minimum timeout (1000ms)', () => {
      assert.strictEqual(resolveShutdownTimeout('1000', undefined), 1000);
    });

    it('accepts maximum timeout (60000ms)', () => {
      assert.strictEqual(resolveShutdownTimeout('60000', undefined), 60000);
    });

    it('rejects timeout below minimum', () => {
      assert.throws(
        () => resolveShutdownTimeout('999', undefined),
        /between 1000 and 60000/i
      );
    });

    it('rejects timeout above maximum', () => {
      assert.throws(
        () => resolveShutdownTimeout('60001', undefined),
        /between 1000 and 60000/i
      );
    });

    it('rejects non-numeric value', () => {
      assert.throws(
        () => resolveShutdownTimeout('abc', undefined),
        /Must be an integer/i
      );
    });

    it('rejects floating point value', () => {
      assert.throws(
        () => resolveShutdownTimeout('5000.5', undefined),
        /Must be an integer/i
      );
    });

    it('rejects negative value', () => {
      assert.throws(
        () => resolveShutdownTimeout('-1000', undefined),
        /between 1000 and 60000/i
      );
    });

    it('ignores whitespace-only values', () => {
      assert.strictEqual(resolveShutdownTimeout('   ', undefined), 5000);
    });
  });
});
