const assertValidTag = (tag: string): void => {
  if (tag.length === 0) {
    throw new Error('Tag must be at least 1 character');
  }
  if (tag.length > 50) {
    throw new Error('Tag exceeds 50 characters');
  }
};

export const normalizeTags = (
  tags: readonly string[],
  maxTags: number
): string[] => {
  if (tags.length === 0) return [];
  if (tags.length > maxTags) {
    throw new Error('Too many tags (max ' + String(maxTags) + ')');
  }
  const seen = new Set<string>();
  for (const tag of tags) {
    assertValidTag(tag);
    seen.add(tag);
  }
  return [...seen];
};
