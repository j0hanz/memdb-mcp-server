import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DefaultOutputSchema } from '../src/schemas/outputs.js';

const describeTest = (title: string, fn: () => void): void => {
  void describe(title, fn);
};

const itTest = (title: string, fn: () => void): void => {
  void it(title, fn);
};

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

describeTest('DefaultOutputSchema success responses', () => {
  itTest('accepts valid success response with result', () => {
    assertSuccess({ ok: true, result: { data: 'test' } });
  });

  itTest('accepts success response with null result', () => {
    assertSuccess({ ok: true, result: null });
  });

  itTest('accepts success response with undefined result', () => {
    assertSuccess({ ok: true, result: undefined });
  });

  itTest('accepts success response without explicit result key', () => {
    assertSuccess({ ok: true });
  });

  itTest('rejects success response with error field', () => {
    assertFailure({
      ok: true,
      result: 'data',
      error: { code: 'E_TEST', message: 'test' },
    });
  });
});

describeTest('DefaultOutputSchema error responses', () => {
  itTest('accepts valid error response', () => {
    assertSuccess({
      ok: false,
      error: { code: 'E_FAILED', message: 'Something went wrong' },
    });
  });

  itTest('accepts error response with optional result for context', () => {
    assertSuccess({
      ok: false,
      error: { code: 'E_PARTIAL', message: 'Partial failure' },
      result: { partial: 'data' },
    });
  });

  itTest('rejects error response without error field', () => {
    assertFailure({ ok: false });
  });

  itTest('rejects error response with missing error code', () => {
    assertFailure({ ok: false, error: { message: 'Missing code' } });
  });

  itTest('rejects error response with missing error message', () => {
    assertFailure({ ok: false, error: { code: 'E_TEST' } });
  });
});

describeTest('DefaultOutputSchema invalid ok field', () => {
  itTest('rejects response with non-boolean ok', () => {
    assertFailure({ ok: 'true', result: 'data' });
  });
});

describeTest('DefaultOutputSchema invalid extras', () => {
  itTest('rejects response with unknown extra fields on success', () => {
    assertFailure({ ok: true, result: 'data', extra: 'field' });
  });

  itTest('rejects response with unknown extra fields on error', () => {
    assertFailure({
      ok: false,
      error: { code: 'E_TEST', message: 'test' },
      extra: 'field',
    });
  });
});

describeTest('DefaultOutputSchema invalid nullish', () => {
  itTest('rejects null', () => {
    assertFailure(null);
  });

  itTest('rejects undefined', () => {
    assertFailure(undefined);
  });

  itTest('rejects empty object', () => {
    assertFailure({});
  });
});
