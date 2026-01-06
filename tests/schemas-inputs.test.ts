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

void describe('input schema store_memory content length', () => {
  void it('validates content length', () => {
    assert.ok(
      StoreMemoryInputSchema.safeParse({ content: repeat(100000) }).success
    );
    assert.ok(
      !StoreMemoryInputSchema.safeParse({ content: repeat(100001) }).success
    );
  });
});

void describe('input schema store_memory tag limits', () => {
  void it('validates tag limits', () => {
    assert.ok(
      StoreMemoryInputSchema.safeParse({ content: 'ok', tags: ['tag'] }).success
    );
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
    assert.ok(
      SearchMemoriesInputSchema.safeParse({
        query: repeat(1000),
        limit: 100,
        tags: Array.from({ length: 50 }, () => 'tag'),
        minRelevance: 1,
      }).success
    );
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({ query: repeat(1001) }).success
    );
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({
        query: 'ok',
        tags: Array.from({ length: 51 }, () => 'tag'),
      }).success
    );
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({ query: 'ok', minRelevance: 1.1 })
        .success
    );
    assert.ok(
      !SearchMemoriesInputSchema.safeParse({ query: 'ok', minRelevance: -0.1 })
        .success
    );
  });
});

void describe('input schema hash length constraints', () => {
  void it('validates hash length constraints', () => {
    const hash = repeat(32);
    assert.ok(GetMemoryInputSchema.safeParse({ hash }).success);
    assert.ok(DeleteMemoryInputSchema.safeParse({ hash }).success);

    assert.ok(!GetMemoryInputSchema.safeParse({ hash: repeat(31) }).success);
    assert.ok(!DeleteMemoryInputSchema.safeParse({ hash: repeat(33) }).success);
  });
});

void describe('input schema relationship constraints', () => {
  void it('validates relationship constraints', () => {
    assert.ok(
      LinkMemoriesInputSchema.safeParse({
        fromHash: repeat(32),
        toHash: repeat(32),
        relationType: 'related',
      }).success
    );
    assert.ok(
      GetRelatedInputSchema.safeParse({ hash: repeat(32), depth: 3 }).success
    );
    assert.ok(
      !GetRelatedInputSchema.safeParse({ hash: repeat(32), depth: 4 }).success
    );
  });
});
