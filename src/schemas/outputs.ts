import { type RefinementCtx, z } from 'zod';

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
