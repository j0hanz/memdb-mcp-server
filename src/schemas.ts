import { type RefinementCtx, z } from 'zod';

const hashSchema = z.string().regex(/^[a-f0-9]{32}$/i);
const tagSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^\S+$/, 'Tag must not contain whitespace');
const tagsSchema = z.array(tagSchema);
const contentSchema = z.string().min(1).max(100000);
const querySchema = z.string().trim().min(1).max(1000);

export const StoreMemoryInputSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.min(1).max(100).meta({
    description:
      'Tags to categorize the memory (1-100 tags, no whitespace, max 50 chars each)',
  }),
});

const StoreMemoryItemSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.min(1).max(100).meta({
    description: 'Tags to categorize the memory',
  }),
});

export const StoreMemoriesInputSchema = z.strictObject({
  items: z.array(StoreMemoryItemSchema).min(1).max(50).meta({
    description: 'Memories to store (1-50 items)',
  }),
});

export const SearchMemoriesInputSchema = z.strictObject({
  query: querySchema.meta({
    description: 'Search query (searches content and tags)',
  }),
  createdAfter: z.iso.datetime().optional().meta({
    description: 'Filter: only memories created after this ISO8601 datetime',
  }),
  createdBefore: z.iso.datetime().optional().meta({
    description: 'Filter: only memories created before this ISO8601 datetime',
  }),
});

export const GetMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'MD5 hash of the memory' }),
});

export const DeleteMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'MD5 hash of the memory' }),
});

export const DeleteMemoriesInputSchema = z.strictObject({
  hashes: z.array(hashSchema).min(1).max(50).meta({
    description: 'MD5 hashes of memories to delete (1-50 hashes)',
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
