const INDEX_MISSING_TOKENS = [
  'no such module: fts5',
  'no such table: memories_fts',
];
const QUERY_INVALID_TOKENS = ['fts5', 'syntax error'];

const isSearchIndexMissing = (message: string): boolean =>
  INDEX_MISSING_TOKENS.some((token) => message.includes(token));

const isSearchQueryInvalid = (message: string): boolean =>
  QUERY_INVALID_TOKENS.some((token) => message.includes(token));

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const SEARCH_ERROR_MAP: {
  matches: (message: string) => boolean;
  build: (message: string) => Error;
}[] = [
  {
    matches: isSearchIndexMissing,
    build: () =>
      new Error(
        'Search index unavailable. Ensure FTS5 is enabled and the index is ' +
          'initialized.'
      ),
  },
  {
    matches: isSearchQueryInvalid,
    build: (message) =>
      new Error(
        'Invalid search query syntax. Check for unbalanced quotes or special ' +
          'characters. ' +
          `Details: ${message}`
      ),
  },
];

export const toSearchError = (err: unknown): Error | undefined => {
  const message = getErrorMessage(err);
  for (const mapping of SEARCH_ERROR_MAP) {
    if (mapping.matches(message)) {
      return mapping.build(message);
    }
  }
  return undefined;
};
