import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { createErrorResponse, getErrorMessage } from '../lib/errors.js';

export const ok = (result: unknown): CallToolResult => {
  const structured = { ok: true as const, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

const withError = (code: string, fn: () => CallToolResult): CallToolResult => {
  try {
    return fn();
  } catch (err) {
    return createErrorResponse(code, getErrorMessage(err));
  }
};

export const wrapHandler = (
  code: string,
  handler: (params: Record<string, unknown>) => CallToolResult
): ((params: Record<string, unknown>) => CallToolResult) => {
  return (params) => withError(code, () => handler(params));
};
