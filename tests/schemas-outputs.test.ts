import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DefaultOutputSchema } from '../src/schemas/outputs.js';

describe('DefaultOutputSchema', () => {
  describe('success responses', () => {
    it('accepts valid success response with result', () => {
      const input = { ok: true, result: { data: 'test' } };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('accepts success response with null result', () => {
      const input = { ok: true, result: null };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('accepts success response with undefined result', () => {
      const input = { ok: true, result: undefined };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('accepts success response without explicit result key (z.unknown permits this)', () => {
      const input = { ok: true };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('rejects success response with error field', () => {
      const input = {
        ok: true,
        result: 'data',
        error: { code: 'E_TEST', message: 'test' },
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });
  });

  describe('error responses', () => {
    it('accepts valid error response', () => {
      const input = {
        ok: false,
        error: { code: 'E_FAILED', message: 'Something went wrong' },
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('accepts error response with optional result for context', () => {
      const input = {
        ok: false,
        error: { code: 'E_PARTIAL', message: 'Partial failure' },
        result: { partial: 'data' },
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, true);
    });

    it('rejects error response without error field', () => {
      const input = { ok: false };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('rejects error response with missing error code', () => {
      const input = {
        ok: false,
        error: { message: 'Missing code' },
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('rejects error response with missing error message', () => {
      const input = {
        ok: false,
        error: { code: 'E_TEST' },
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });
  });

  describe('invalid responses', () => {
    it('rejects response with non-boolean ok', () => {
      const input = { ok: 'true', result: 'data' };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('rejects response with unknown extra fields on success', () => {
      const input = { ok: true, result: 'data', extra: 'field' };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('rejects response with unknown extra fields on error', () => {
      const input = {
        ok: false,
        error: { code: 'E_TEST', message: 'test' },
        extra: 'field',
      };
      const result = DefaultOutputSchema.safeParse(input);
      assert.strictEqual(result.success, false);
    });

    it('rejects null', () => {
      const result = DefaultOutputSchema.safeParse(null);
      assert.strictEqual(result.success, false);
    });

    it('rejects undefined', () => {
      const result = DefaultOutputSchema.safeParse(undefined);
      assert.strictEqual(result.success, false);
    });

    it('rejects empty object', () => {
      const result = DefaultOutputSchema.safeParse({});
      assert.strictEqual(result.success, false);
    });
  });
});
