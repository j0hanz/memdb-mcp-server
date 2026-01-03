import { z } from 'zod';

const SuccessOutputSchema = z.strictObject({
  ok: z.literal(true),
  result: z.unknown(),
});

const ErrorOutputSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({ code: z.string(), message: z.string() }),
  result: z.unknown().optional(),
});

export const DefaultOutputSchema = z.discriminatedUnion('ok', [
  SuccessOutputSchema,
  ErrorOutputSchema,
]);
