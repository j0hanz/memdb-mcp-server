import { z } from 'zod';

const hashSchema = z.string().min(32).max(32);
const tagSchema = z.string().min(1).max(50);
const tagsSchema = z.array(tagSchema);
const contentSchema = z.string().min(1).max(100000);
const querySchema = z.string().trim().min(1).max(1000);
const importanceSchema = z.number().min(0).max(10);
const memoryTypeSchema = z.string().min(1).max(50);

export const StoreMemoryInputSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.max(100).optional().meta({
    description:
      'Tags to categorize the memory (max 100 tags, each max 50 chars)',
  }),
  importance: importanceSchema
    .optional()
    .meta({ description: 'Importance score (0-10)' }),
  memoryType: memoryTypeSchema
    .optional()
    .meta({ description: 'Type of memory (e.g., conversation, fact, rule)' }),
});

export const SearchMemoriesInputSchema = z.strictObject({
  query: querySchema.meta({ description: 'Search query' }),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: 'Maximum number of results' }),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .meta({ description: 'Pagination offset (skip N results)' }),
  tags: tagsSchema.max(50).optional().meta({
    description: 'Filter by tags (max 50 tags)',
  }),
  minRelevance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({ description: 'Minimum relevance score' }),
});

export const GetMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'MD5 hash of the memory' }),
});

export const DeleteMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'MD5 hash of the memory' }),
});

export const LinkMemoriesInputSchema = z.strictObject({
  fromHash: hashSchema.meta({ description: 'Hash of the source memory' }),
  toHash: hashSchema.meta({ description: 'Hash of the target memory' }),
  relationType: memoryTypeSchema.meta({ description: 'Type of relationship' }),
});

export const GetRelatedInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'Hash of the memory' }),
  relationType: memoryTypeSchema
    .optional()
    .meta({ description: 'Filter by relationship type' }),
  depth: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .meta({ description: 'Traversal depth (1-3)' }),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional().meta({
    description:
      'Relationship direction: outgoing (default), incoming, or both',
  }),
});

export const UpdateMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'MD5 hash of the memory to update' }),
  importance: importanceSchema
    .optional()
    .meta({ description: 'New importance score (0-10)' }),
  memoryType: memoryTypeSchema
    .optional()
    .meta({ description: 'New memory type' }),
  tags: tagsSchema
    .max(100)
    .optional()
    .meta({ description: 'Replace all tags with these (max 100 tags)' }),
  addTags: tagsSchema
    .max(100)
    .optional()
    .meta({ description: 'Tags to add (max 100 tags)' }),
  removeTags: tagsSchema
    .max(100)
    .optional()
    .meta({ description: 'Tags to remove (max 100 tags)' }),
});

export const MemoryStatsInputSchema = z.strictObject({});

// Type inference exports for schema-handler type sync
export type StoreMemoryInput = z.infer<typeof StoreMemoryInputSchema>;
export type SearchMemoriesInput = z.infer<typeof SearchMemoriesInputSchema>;
export type GetMemoryInput = z.infer<typeof GetMemoryInputSchema>;
export type DeleteMemoryInput = z.infer<typeof DeleteMemoryInputSchema>;
export type LinkMemoriesInput = z.infer<typeof LinkMemoriesInputSchema>;
export type GetRelatedInput = z.infer<typeof GetRelatedInputSchema>;
export type UpdateMemoryInput = z.infer<typeof UpdateMemoryInputSchema>;
