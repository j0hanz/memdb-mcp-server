import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createErrorResponse, getErrorMessage } from '../src/lib/errors.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

describeTest('errors', () => {
  itTest('normalizes error messages', () => {
    assert.strictEqual(getErrorMessage(new Error('boom')), 'boom');
    assert.strictEqual(getErrorMessage('text'), 'text');
    assert.strictEqual(getErrorMessage(''), 'Unknown error');
    assert.strictEqual(getErrorMessage(42), 'Unknown error');
  });

  itTest('creates structured error responses', () => {
    const response = createErrorResponse('E_CODE', 'message', { ok: false });
    assert.strictEqual(response.isError, true);
    assert.strictEqual(response.structuredContent.ok, false);
    assert.strictEqual(response.structuredContent.error.code, 'E_CODE');
    assert.strictEqual(response.structuredContent.error.message, 'message');
  });
});
