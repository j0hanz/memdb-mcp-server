import type { SearchResult } from '../types/index.js';
import { mapRowToSearchResult } from './row-mappers.js';
import { buildSearchQuery, executeSearch } from './search.js';
import { normalizeTags } from './tags.js';

interface SearchInput {
  query: string;
  limit?: number | undefined;
  tags?: readonly string[] | undefined;
  minRelevance?: number | undefined;
  offset?: number | undefined;
}

const buildSearchInput = (
  input: SearchInput
): {
  query: string;
  limit: number;
  tags: readonly string[];
  minRelevance?: number;
  offset?: number;
} => {
  const result: {
    query: string;
    limit: number;
    tags: readonly string[];
    minRelevance?: number;
    offset?: number;
  } = {
    query: input.query,
    limit: input.limit ?? 10,
    tags: normalizeTags(input.tags ?? [], 50),
  };

  if (input.minRelevance !== undefined) {
    result.minRelevance = input.minRelevance;
  }
  if (input.offset !== undefined) {
    result.offset = input.offset;
  }
  return result;
};

export const searchMemories = (input: SearchInput): SearchResult[] => {
  const searchInput = buildSearchInput(input);
  const { sql, params } = buildSearchQuery(searchInput);
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};
