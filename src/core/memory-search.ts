import type { SearchResult } from '../types/index.js';
import { mapRowToSearchResult } from './row-mappers.js';
import { buildSearchQuery, executeSearch } from './search.js';
import { normalizeTags } from './tags.js';

interface SearchMemoriesInput {
  query: string;
  limit?: number;
  tags?: readonly string[];
  minRelevance?: number;
  offset?: number;
}

export const searchMemories = (input: SearchMemoriesInput): SearchResult[] => {
  const { query, limit = 10, tags = [], minRelevance, offset } = input;
  const searchInput = {
    query,
    limit,
    tags: normalizeTags(tags, 50),
    ...(minRelevance !== undefined ? { minRelevance } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
  const { sql, params } = buildSearchQuery(searchInput);
  const rows = executeSearch(sql, params);
  return rows.map((row) => mapRowToSearchResult(row));
};
