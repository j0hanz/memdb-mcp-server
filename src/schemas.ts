import { type RefinementCtx, z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{32}$/i);
const tagSchema = z.string().min(1).max(50);
const tagsSchema = z.array(tagSchema);
const contentSchema = z.string().min(1).max(100000);
const querySchema = z.string().trim().min(1).max(1000);
const relationTypeSchema = z.string().min(1).max(50);

export const StoreMemoryInputSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.max(100).optional().meta({
    description:
      'Tags to categorize the memory (max 100 tags, each max 50 chars)',
  }),
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
  tags: tagsSchema.max(50).optional().meta({
    description: 'Filter by tags (max 50 tags)',
  }),
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
  relationType: relationTypeSchema.meta({
    description: 'Type of relationship',
  }),
});

export const GetRelatedInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'Hash of the memory' }),
  relationType: relationTypeSchema
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
  content: contentSchema.meta({ description: 'New content for the memory' }),
  tags: tagsSchema
    .max(100)
    .optional()
    .meta({ description: 'Replace tags (max 100 tags, each max 50 chars)' }),
});

export const MemoryStatsInputSchema = z
  .strictObject({})
  .meta({ description: 'No parameters required' });

const ErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

const DefaultOutputSchemaBase = z.strictObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: ErrorSchema.optional(),
});

const addIssue = (
  ctx: RefinementCtx,
  path: string[],
  message: string
): void => {
  ctx.addIssue({
    code: 'custom',
    message,
    path,
  });
};

export const DefaultOutputSchema = DefaultOutputSchemaBase.superRefine(
  (value, ctx) => {
    if (value.ok) {
      if (value.error !== undefined) {
        addIssue(ctx, ['error'], 'error must be absent when ok is true');
      }
      return;
    }

    if (value.error === undefined) {
      addIssue(ctx, ['error'], 'error is required when ok is false');
    }
  }
);
