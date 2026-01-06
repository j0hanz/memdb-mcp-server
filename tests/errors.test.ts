import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createErrorResponse, getErrorMessage } from '../src/lib/errors.js';

void describe('errors', () => {
  void it('normalizes error messages', () => {
    assert.strictEqual(getErrorMessage(new Error('boom')), 'boom');
    assert.strictEqual(getErrorMessage('text'), 'text');
    assert.strictEqual(getErrorMessage(''), 'Unknown error');
    assert.strictEqual(getErrorMessage(42), 'Unknown error');
  });

  void it('creates structured error responses', () => {
    const response = createErrorResponse('E_CODE', 'message', { ok: false });
    assert.strictEqual(response.isError, true);
    assert.strictEqual(response.structuredContent.ok, false);
    assert.strictEqual(response.structuredContent.error.code, 'E_CODE');
    assert.strictEqual(response.structuredContent.error.message, 'message');
  });
});
