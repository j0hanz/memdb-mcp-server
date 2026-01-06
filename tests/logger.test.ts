import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLogger } from '../src/utils/logger.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

const toLogLine = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return String(value);
  return '';
};

describeTest('logger', () => {
  itTest('respects log level filtering', () => {
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
      const firstCall = calls[0];
      const firstLine = toLogLine(firstCall?.[0]);
      assert.match(firstLine, /\[ERROR\]/);
    } finally {
      console.error = original;
    }
  });
});
