import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

type ErrorResponse = CallToolResult & {
  content: { type: 'text'; text: string }[];
  structuredContent: {
    ok: false;
    error: { code: string; message: string };
    result?: unknown;
  };
  isError: true;
};

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return toNonEmptyString(error) ?? 'Unknown error';
}

export function createErrorResponse(
  code: string,
  message: string,
  result?: unknown
): ErrorResponse {
  const structured = {
    ok: false as const,
    error: { code, message },
    ...(result !== undefined && { result }),
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true as const,
  };
}
