import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

export type ToolSchema = ZodRawShapeCompat | AnySchema;

export interface ToolDef {
  name: string;
  options: {
    title: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (params: Record<string, unknown>) => CallToolResult;
}
