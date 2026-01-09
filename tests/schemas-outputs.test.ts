import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DefaultOutputSchema } from '../src/schemas.js';

const parse = (
  input: unknown
): ReturnType<typeof DefaultOutputSchema.safeParse> =>
  DefaultOutputSchema.safeParse(input);

const assertSuccess = (input: unknown): void => {
  assert.strictEqual(parse(input).success, true);
};

const assertFailure = (input: unknown): void => {
  assert.strictEqual(parse(input).success, false);
};

void describe('DefaultOutputSchema success responses', () => {
  void it('accepts valid success response with result', () => {
    assertSuccess({ ok: true, result: { data: 'test' } });
  });

  void it('accepts success response with null result', () => {
    assertSuccess({ ok: true, result: null });
  });

  void it('accepts success response with undefined result', () => {
    assertSuccess({ ok: true, result: undefined });
  });

  void it('accepts success response without explicit result key', () => {
    assertSuccess({ ok: true });
  });

  void it('rejects success response with error field', () => {
    assertFailure({
      ok: true,
      result: 'data',
      error: { code: 'E_TEST', message: 'test' },
    });
  });
});

void describe('DefaultOutputSchema error responses', () => {
  void it('accepts valid error response', () => {
    assertSuccess({
      ok: false,
      error: { code: 'E_FAILED', message: 'Something went wrong' },
    });
  });

  void it('accepts error response with optional result for context', () => {
    assertSuccess({
      ok: false,
      error: { code: 'E_PARTIAL', message: 'Partial failure' },
      result: { partial: 'data' },
    });
  });

  void it('rejects error response without error field', () => {
    assertFailure({ ok: false });
  });

  void it('rejects error response with missing error code', () => {
    assertFailure({ ok: false, error: { message: 'Missing code' } });
  });

  void it('rejects error response with missing error message', () => {
    assertFailure({ ok: false, error: { code: 'E_TEST' } });
  });
});

void describe('DefaultOutputSchema invalid ok field', () => {
  void it('rejects response with non-boolean ok', () => {
    assertFailure({ ok: 'true', result: 'data' });
  });
});

void describe('DefaultOutputSchema invalid extras', () => {
  void it('rejects response with unknown extra fields on success', () => {
    assertFailure({ ok: true, result: 'data', extra: 'field' });
  });

  void it('rejects response with unknown extra fields on error', () => {
    assertFailure({
      ok: false,
      error: { code: 'E_TEST', message: 'test' },
      extra: 'field',
    });
  });
});

void describe('DefaultOutputSchema invalid nullish', () => {
  void it('rejects null', () => {
    assertFailure(null);
  });

  void it('rejects undefined', () => {
    assertFailure(undefined);
  });

  void it('rejects empty object', () => {
    assertFailure({});
  });
});
