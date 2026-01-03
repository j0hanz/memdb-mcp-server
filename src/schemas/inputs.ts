import { z } from 'zod';

export const StoreMemoryInputSchema = z.strictObject({
  content: z
    .string()
    .min(1)
    .max(100000)
    .meta({ description: 'The content of the memory' }),
  tags: z.array(z.string().min(1).max(50)).max(100).optional().meta({
    description:
      'Tags to categorize the memory (max 100 tags, each max 50 chars)',
  }),
  importance: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .meta({ description: 'Importance score (0-10)' }),
  memoryType: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .meta({ description: 'Type of memory (e.g., conversation, fact, rule)' }),
});

export const SearchMemoriesInputSchema = z.strictObject({
  query: z.string().min(1).max(1000).meta({ description: 'Search query' }),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: 'Maximum number of results' }),
  tags: z
    .array(z.string().min(1).max(50))
    .max(50)
    .optional()
    .meta({ description: 'Filter by tags (max 50 tags)' }),
  minRelevance: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .meta({ description: 'Minimum relevance score' }),
});

export const GetMemoryInputSchema = z.strictObject({
  hash: z
    .string()
    .min(32)
    .max(32)
    .meta({ description: 'MD5 hash of the memory' }),
});

export const DeleteMemoryInputSchema = z.strictObject({
  hash: z
    .string()
    .min(32)
    .max(32)
    .meta({ description: 'MD5 hash of the memory' }),
});

export const LinkMemoriesInputSchema = z.strictObject({
  fromHash: z
    .string()
    .min(32)
    .max(32)
    .meta({ description: 'Hash of the source memory' }),
  toHash: z
    .string()
    .min(32)
    .max(32)
    .meta({ description: 'Hash of the target memory' }),
  relationType: z
    .string()
    .min(1)
    .max(50)
    .meta({ description: 'Type of relationship' }),
});

export const GetRelatedInputSchema = z.strictObject({
  hash: z.string().min(32).max(32).meta({ description: 'Hash of the memory' }),
  relationType: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .meta({ description: 'Filter by relationship type' }),
  depth: z
    .number()
    .min(1)
    .max(3)
    .optional()
    .meta({ description: 'Traversal depth (1-3)' }),
});

export const MemoryStatsInputSchema = z.strictObject({}).optional();
