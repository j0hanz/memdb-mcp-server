import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoryInputSchema,
} from '../src/schemas.js';

const repeat = (length: number): string => 'a'.repeat(length);

void describe('input schema store_memory content length', () => {
  void it('validates content length', () => {
    assert.ok(
      StoreMemoryInputSchema.safeParse({ content: repeat(100000), tags: ['t'] })
        .success
    );
    assert.ok(
      !StoreMemoryInputSchema.safeParse({
        content: repeat(100001),
        tags: ['t'],
      }).success
    );
  });
});

void describe('input schema store_memory tag constraints', () => {
  void it('requires at least one tag', () => {
    // Missing tags field
    assert.ok(!StoreMemoryInputSchema.safeParse({ content: 'ok' }).success);
    // Empty tags array
    assert.ok(
      !StoreMemoryInputSchema.safeParse({ content: 'ok', tags: [] }).success
    );
    // Valid with one tag
    assert.ok(
      StoreMemoryInputSchema.safeParse({ content: 'ok', tags: ['tag'] }).success
    );
  });

  void it('rejects tags with whitespace', () => {
    assert.ok(
      !StoreMemoryInputSchema.safeParse({ content: 'ok', tags: ['has space'] })
        .success
    );
    assert.ok(
      !StoreMemoryInputSchema.safeParse({ content: 'ok', tags: ['has\ttab'] })
        .success
    );
    // Hyphenated tags are valid
    assert.ok(
      StoreMemoryInputSchema.safeParse({ content: 'ok', tags: ['hyphen-ok'] })
        .success
    );
  });

  void it('validates tag limits', () => {
    assert.ok(
      !StoreMemoryInputSchema.safeParse({
        content: 'ok',
        tags: Array.from({ length: 101 }, () => 'tag'),
      }).success
    );
    assert.ok(
      !StoreMemoryInputSchema.safeParse({
        content: 'ok',
        tags: [repeat(51)],
      }).success
    );
  });
});

void describe('input schema search constraints', () => {
  void it('validates search constraints', () => {
    // Valid query
    assert.ok(
      SearchMemoriesInputSchema.safeParse({
        query: repeat(1000),
      }).success
    );
    // Query too long
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({ query: repeat(1001) }).success
    );
    // Whitespace-only query rejected
    assert.ok(!SearchMemoriesInputSchema.safeParse({ query: '   ' }).success);
    // Extra fields rejected (strictObject)
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({ query: 'ok', limit: 10 }).success
    );
  });
});

void describe('input schema hash length constraints', () => {
  void it('validates hash length constraints', () => {
    assert.ok(GetMemoryInputSchema.safeParse({ hash: repeat(64) }).success);
    assert.ok(DeleteMemoryInputSchema.safeParse({ hash: repeat(64) }).success);

    assert.ok(!GetMemoryInputSchema.safeParse({ hash: repeat(31) }).success);
    assert.ok(!DeleteMemoryInputSchema.safeParse({ hash: repeat(32) }).success);
    assert.ok(!DeleteMemoryInputSchema.safeParse({ hash: repeat(63) }).success);
    assert.ok(!DeleteMemoryInputSchema.safeParse({ hash: repeat(65) }).success);
  });
});
