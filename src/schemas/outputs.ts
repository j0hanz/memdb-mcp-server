import { z } from 'zod';

const ErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
});

const DefaultOutputSchemaBase = z.strictObject({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: ErrorSchema.optional(),
});

export const DefaultOutputSchema = DefaultOutputSchemaBase.superRefine(
  (value, ctx) => {
    if (value.ok) {
      if (value.error !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'error must be absent when ok is true',
          path: ['error'],
        });
      }
      return;
    }

    if (value.error === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'error is required when ok is false',
        path: ['error'],
      });
    }
  }
);
