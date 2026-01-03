import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
  GetRelatedInputSchema,
  LinkMemoriesInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoryInputSchema,
} from '../src/schemas/inputs.js';

const repeat = (length: number): string => 'a'.repeat(length);

describe('input schemas', () => {
  it('validates store_memory content length', () => {
    const ok = StoreMemoryInputSchema.safeParse({ content: repeat(100000) });
    assert.ok(ok.success);

    const tooLong = StoreMemoryInputSchema.safeParse({
      content: repeat(100001),
    });
    assert.ok(!tooLong.success);
  });

  it('validates store_memory tag limits', () => {
    const ok = StoreMemoryInputSchema.safeParse({
      content: 'ok',
      tags: ['tag'],
    });
    assert.ok(ok.success);

    const tooMany = StoreMemoryInputSchema.safeParse({
      content: 'ok',
      tags: Array.from({ length: 101 }, () => 'tag'),
    });
    assert.ok(!tooMany.success);

    const tooLongTag = StoreMemoryInputSchema.safeParse({
      content: 'ok',
      tags: [repeat(51)],
    });
    assert.ok(!tooLongTag.success);
  });

  it('validates search constraints', () => {
    const ok = SearchMemoriesInputSchema.safeParse({
      query: repeat(1000),
      limit: 100,
      tags: Array.from({ length: 50 }, () => 'tag'),
      minRelevance: 1,
    });
    assert.ok(ok.success);

    const tooLongQuery = SearchMemoriesInputSchema.safeParse({
      query: repeat(1001),
    });
    assert.ok(!tooLongQuery.success);

    const tooManyTags = SearchMemoriesInputSchema.safeParse({
      query: 'ok',
      tags: Array.from({ length: 51 }, () => 'tag'),
    });
    assert.ok(!tooManyTags.success);

    const tooHighRelevance = SearchMemoriesInputSchema.safeParse({
      query: 'ok',
      minRelevance: 1.1,
    });
    assert.ok(!tooHighRelevance.success);

    const tooLowRelevance = SearchMemoriesInputSchema.safeParse({
      query: 'ok',
      minRelevance: -0.1,
    });
    assert.ok(!tooLowRelevance.success);
  });

  it('validates hash length constraints', () => {
    const hash = repeat(32);
    assert.ok(GetMemoryInputSchema.safeParse({ hash }).success);
    assert.ok(DeleteMemoryInputSchema.safeParse({ hash }).success);

    assert.ok(!GetMemoryInputSchema.safeParse({ hash: repeat(31) }).success);
    assert.ok(!DeleteMemoryInputSchema.safeParse({ hash: repeat(33) }).success);
  });

  it('validates relationship constraints', () => {
    const valid = LinkMemoriesInputSchema.safeParse({
      fromHash: repeat(32),
      toHash: repeat(32),
      relationType: 'related',
    });
    assert.ok(valid.success);

    const depthOk = GetRelatedInputSchema.safeParse({
      hash: repeat(32),
      depth: 3,
    });
    assert.ok(depthOk.success);

    const depthTooHigh = GetRelatedInputSchema.safeParse({
      hash: repeat(32),
      depth: 4,
    });
    assert.ok(!depthTooHigh.success);
  });
});
