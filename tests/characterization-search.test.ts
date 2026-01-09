import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildSearchQuery } from '../src/core/search.js';

const normalizeSql = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

interface SearchCase {
  name: string;
  input: {
    query: string;
    limit: number;
    tags: readonly string[];
    minRelevance?: number;
    offset?: number;
  };
  expected: {
    sqlNormalized: string;
    params: (number | string)[];
  };
}

const loadCases = async (): Promise<SearchCase[]> => {
  const data = await readFile(
    new URL('./fixtures/search-queries.json', import.meta.url),
    'utf-8'
  );
  return JSON.parse(data) as SearchCase[];
};

void describe('characterization: buildSearchQuery', () => {
  void it('matches captured query shapes', async () => {
    const cases = await loadCases();

    for (const testCase of cases) {
      const { sql, params } = buildSearchQuery(testCase.input);
      assert.strictEqual(
        normalizeSql(sql),
        testCase.expected.sqlNormalized,
        `SQL mismatch for ${testCase.name}`
      );
      assert.deepStrictEqual(
        params,
        testCase.expected.params,
        `Params mismatch for ${testCase.name}`
      );
    }
  });
});
