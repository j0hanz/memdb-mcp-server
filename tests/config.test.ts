import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveDbPath,
  resolveLogLevel,
  resolveShutdownTimeout,
} from '../src/utils/config.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

const resolveLevel = (cliValue?: string, envValue?: string): string =>
  resolveLogLevel({
    ...(cliValue !== undefined ? { cliValue } : {}),
    ...(envValue !== undefined ? { envValue } : {}),
  });

const resolveDb = (
  cliDbPath?: string,
  cliMemory?: boolean,
  envPath?: string
): string =>
  resolveDbPath({
    ...(cliDbPath !== undefined ? { cliDbPath } : {}),
    ...(cliMemory !== undefined ? { cliMemory } : {}),
    ...(envPath !== undefined ? { envPath } : {}),
  });

const resolveTimeout = (cliValue?: string, envValue?: string): number =>
  resolveShutdownTimeout({
    ...(cliValue !== undefined ? { cliValue } : {}),
    ...(envValue !== undefined ? { envValue } : {}),
  });

describeTest('config resolveLogLevel', () => {
  itTest('rejects invalid log level', () => {
    assert.throws(() => resolveLevel(undefined, 'debug'), /Invalid log level/i);
  });

  itTest('accepts default log level when unspecified', () => {
    assert.strictEqual(resolveLevel(undefined, undefined), 'info');
  });
});

describeTest('config resolveDbPath', () => {
  itTest('rejects database path containing null byte', () => {
    assert.throws(() => resolveDb(undefined, false, 'bad\0path'), /null byte/i);
  });

  itTest('allows memory mode regardless of env path', () => {
    assert.strictEqual(resolveDb(undefined, true, 'bad\0path'), ':memory:');
  });
});

describeTest('config resolveShutdownTimeout defaults', () => {
  itTest('returns default timeout when unspecified', () => {
    assert.strictEqual(resolveTimeout(undefined, undefined), 5000);
  });
});

describeTest('config resolveShutdownTimeout accepts', () => {
  itTest('accepts valid timeout from CLI', () => {
    assert.strictEqual(resolveTimeout('10000', undefined), 10000);
  });

  itTest('accepts valid timeout from env', () => {
    assert.strictEqual(resolveTimeout(undefined, '15000'), 15000);
  });

  itTest('CLI takes precedence over env', () => {
    assert.strictEqual(resolveTimeout('8000', '12000'), 8000);
  });

  itTest('accepts minimum timeout (1000ms)', () => {
    assert.strictEqual(resolveTimeout('1000', undefined), 1000);
  });

  itTest('accepts maximum timeout (60000ms)', () => {
    assert.strictEqual(resolveTimeout('60000', undefined), 60000);
  });
});

describeTest('config resolveShutdownTimeout rejects', () => {
  itTest('rejects timeout below minimum', () => {
    assert.throws(
      () => resolveTimeout('999', undefined),
      /between 1000 and 60000/i
    );
  });

  itTest('rejects timeout above maximum', () => {
    assert.throws(
      () => resolveTimeout('60001', undefined),
      /between 1000 and 60000/i
    );
  });

  itTest('rejects non-numeric value', () => {
    assert.throws(
      () => resolveTimeout('abc', undefined),
      /Must be an integer/i
    );
  });

  itTest('rejects floating point value', () => {
    assert.throws(
      () => resolveTimeout('5000.5', undefined),
      /Must be an integer/i
    );
  });

  itTest('rejects negative value', () => {
    assert.throws(
      () => resolveTimeout('-1000', undefined),
      /between 1000 and 60000/i
    );
  });
});

describeTest('config resolveShutdownTimeout whitespace', () => {
  itTest('ignores whitespace-only values', () => {
    assert.strictEqual(resolveTimeout('   ', undefined), 5000);
  });
});
