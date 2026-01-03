const INDEX_MISSING_TOKENS = [
  'no such module: fts5',
  'no such table: memories_fts',
];
const QUERY_INVALID_TOKENS = ['fts5', 'syntax error'];

export const isSearchIndexMissing = (message: string): boolean =>
  INDEX_MISSING_TOKENS.some((token) => message.includes(token));

export const isSearchQueryInvalid = (message: string): boolean =>
  QUERY_INVALID_TOKENS.some((token) => message.includes(token));

export const toSearchError = (err: unknown): Error | undefined => {
  const message = err instanceof Error ? err.message : String(err);
  if (isSearchIndexMissing(message)) {
    return new Error(
      'Search index unavailable. Ensure FTS5 is enabled and the index is ' +
        'initialized.'
    );
  }
  if (isSearchQueryInvalid(message)) {
    return new Error(
      'Invalid search query syntax. Check for unbalanced quotes or special ' +
        'characters. ' +
        `Details: ${message}`
    );
  }
  return undefined;
};
