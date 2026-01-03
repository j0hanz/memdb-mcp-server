import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLogger } from '../src/utils/logger.js';

describe('logger', () => {
  it('respects log level filtering', () => {
    const calls: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      const logger = createLogger('error');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      assert.strictEqual(calls.length, 1);
      assert.match(String(calls[0]?.[0] ?? ''), /\[ERROR\]/);
    } finally {
      console.error = original;
    }
  });
});
