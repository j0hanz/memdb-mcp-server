import { type RefinementCtx, z } from 'zod';

import { MEMORY_TYPES } from './types.js';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const tagSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^\S+$/, 'Tag must not contain whitespace');
const tagsSchema = z.array(tagSchema);
const contentSchema = z.string().min(1).max(100000);
const querySchema = z.string().trim().min(1).max(1000);
const importanceSchema = z.number().int().min(0).max(10);
const memoryTypeSchema = z.enum(MEMORY_TYPES);
const relationTypeSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^\S+$/, 'Relation type must not contain whitespace');

export const StoreMemoryInputSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.min(1).max(100).meta({
    description:
      'Tags to categorize the memory (1-100 tags, no whitespace, max 50 chars each)',
  }),
  importance: importanceSchema.optional().meta({
    description:
      'Priority level 0-10 (0=lowest, 10=critical). Higher importance memories surface first in search.',
  }),
  memory_type: memoryTypeSchema.optional().meta({
    description:
      'Category: general, fact, plan, decision, reflection, lesson, error, gradient',
  }),
});

const StoreMemoryItemSchema = z.strictObject({
  content: contentSchema.meta({ description: 'The content of the memory' }),
  tags: tagsSchema.min(1).max(100).meta({
    description: 'Tags to categorize the memory',
  }),
  importance: importanceSchema.optional().meta({
    description: 'Priority level 0-10 (0=lowest, 10=critical)',
  }),
  memory_type: memoryTypeSchema.optional().meta({
    description:
      'Category: general, fact, plan, decision, reflection, lesson, error, gradient',
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
});

export const GetMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({
    description: 'Hash of the memory (SHA-256, 64 hex chars)',
  }),
});

export const DeleteMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({
    description: 'Hash of the memory (SHA-256, 64 hex chars)',
  }),
});

export const DeleteMemoriesInputSchema = z.strictObject({
  hashes: z.array(hashSchema).min(1).max(50).meta({
    description: 'Hashes of memories to delete (1-50 hashes)',
  }),
});

export const UpdateMemoryInputSchema = z.strictObject({
  hash: hashSchema.meta({ description: 'Hash of the memory to update' }),
  content: contentSchema.meta({ description: 'New content for the memory' }),
  tags: tagsSchema
    .max(100)
    .optional()
    .meta({ description: 'Replace tags (max 100 tags, each max 50 chars)' }),
});

export const MemoryStatsInputSchema = z
  .strictObject({})
  .meta({ description: 'No parameters required' });

export const CreateRelationshipInputSchema = z.strictObject({
  from_hash: hashSchema.meta({
    description: 'SHA-256 hash of the source memory',
  }),
  to_hash: hashSchema.meta({
    description: 'SHA-256 hash of the target memory',
  }),
  relation_type: relationTypeSchema.meta({
    description:
      'Type of relationship (e.g., "related_to", "causes", "depends_on", "part_of", "follows")',
  }),
});

export const GetRelationshipsInputSchema = z.strictObject({
  hash: hashSchema.meta({
    description: 'SHA-256 hash of the memory to get relationships for',
  }),
  direction: z.enum(['outgoing', 'incoming', 'both']).optional().meta({
    description:
      'Direction: outgoing (from this memory), incoming (to this memory), both (default)',
  }),
});

export const DeleteRelationshipInputSchema = z.strictObject({
  from_hash: hashSchema.meta({
    description: 'SHA-256 hash of the source memory',
  }),
  to_hash: hashSchema.meta({
    description: 'SHA-256 hash of the target memory',
  }),
  relation_type: relationTypeSchema.meta({
    description: 'Type of relationship to delete',
  }),
});

export const RecallInputSchema = z.strictObject({
  query: querySchema.meta({
    description: 'Search query to find initial memories',
  }),
  depth: z.number().int().min(0).max(3).optional().meta({
    description:
      'How many relationship hops to follow (0-3, default 1). 0 = search only, no graph traversal.',
  }),
});

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
