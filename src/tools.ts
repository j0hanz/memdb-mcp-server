import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  AnySchema,
  ZodRawShapeCompat,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';

import { runWithToolContext } from './async-context.js';
import { config } from './config.js';
import {
  deleteMemories,
  deleteMemory,
  getMemory,
  getStats,
} from './core/memory-read.js';
import {
  createMemories,
  createMemory,
  updateMemory,
} from './core/memory-write.js';
import {
  createRelationship,
  deleteRelationship,
  getRelationships,
} from './core/relationships.js';
import { recallMemories, searchMemories } from './core/search.js';
import { logger } from './logger.js';
import {
  CreateRelationshipInputSchema,
  DefaultOutputSchema,
  DeleteMemoriesInputSchema,
  DeleteMemoryInputSchema,
  DeleteRelationshipInputSchema,
  GetMemoryInputSchema,
  GetRelationshipsInputSchema,
  MemoryStatsInputSchema,
  RecallInputSchema,
  SearchMemoriesInputSchema,
  StoreMemoriesInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from './schemas.js';

type MaybePromise<T> = T | Promise<T>;
type ToolSchema = ZodRawShapeCompat | AnySchema;

type CreateMemoryInput = Parameters<typeof createMemory>[0];

type Dependency<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => MaybePromise<R>
  : never;

export interface ToolDependencies {
  createMemory: Dependency<typeof createMemory>;
  createMemories: Dependency<typeof createMemories>;
  updateMemory: Dependency<typeof updateMemory>;
  getMemory: Dependency<typeof getMemory>;
  deleteMemory: Dependency<typeof deleteMemory>;
  deleteMemories: Dependency<typeof deleteMemories>;
  searchMemories: Dependency<typeof searchMemories>;
  getStats: Dependency<typeof getStats>;
  createRelationship: Dependency<typeof createRelationship>;
  getRelationships: Dependency<typeof getRelationships>;
  deleteRelationship: Dependency<typeof deleteRelationship>;
  recallMemories: Dependency<typeof recallMemories>;
}

const defaultDeps: ToolDependencies = {
  createMemory,
  createMemories,
  updateMemory,
  getMemory,
  deleteMemory,
  deleteMemories,
  searchMemories,
  getStats,
  createRelationship,
  getRelationships,
  deleteRelationship,
  recallMemories,
};

interface ErrorStructured {
  [x: string]: unknown;
  ok: false;
  error: { code: string; message: string };
  result?: unknown;
}

interface SuccessStructured {
  [x: string]: unknown;
  ok: true;
  result: unknown;
}

type ErrorResponse = CallToolResult & {
  content: { type: 'text'; text: string }[];
  structuredContent: ErrorStructured;
  isError: true;
};

const TOOL_TIMEOUT_MS = config.toolTimeoutMs;

const normalizeHash = (hash: string): string => hash.toLowerCase();

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isNonEmptyString(error)) return error;
  return 'Unknown error';
};

const createErrorResponse = (
  code: string,
  message: string,
  result?: unknown
): ErrorResponse => {
  const structured: ErrorStructured = {
    ok: false,
    error: { code, message },
    ...(result !== undefined ? { result } : {}),
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
    isError: true,
  };
};

const createSuccessResponse = (result: unknown): CallToolResult => {
  const structured: SuccessStructured = { ok: true, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structured) }],
    structuredContent: structured,
  };
};

class ToolFailure extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    readonly result?: unknown
  ) {
    super(message);
    this.code = code;
  }
}

interface ToolContext {
  signal: AbortSignal;
}

const createTimeoutResponse = (timeoutMs: number): ErrorResponse =>
  createErrorResponse(
    'E_TIMEOUT',
    `Tool execution timed out after ${timeoutMs}ms`,
    { timeoutMs }
  );

const createTimedToolHandler = (
  toolName: string,
  defaultErrorCode: string,
  timeoutMs: number,
  run: (params: unknown, ctx: ToolContext) => MaybePromise<CallToolResult>
): ((params: unknown) => Promise<CallToolResult>) => {
  return async (params: unknown) => {
    const controller = new AbortController();
    const ctx: ToolContext = { signal: controller.signal };
    const store = { toolName, startTime: Date.now() };
    let outcome: 'error' | 'ok' | 'timeout' = 'ok';

    const execution = runWithToolContext(store, () =>
      Promise.resolve().then(() => run(params, ctx))
    );

    const logOutcome = (): void => {
      const durationMs = Date.now() - store.startTime;
      runWithToolContext(store, () => {
        logger.info(`Tool ${toolName} ${outcome} in ${durationMs}ms`);
      });
    };

    if (timeoutMs <= 0) {
      try {
        return await execution;
      } catch (err) {
        outcome = 'error';
        if (err instanceof ToolFailure) {
          return createErrorResponse(err.code, err.message, err.result);
        }
        return createErrorResponse(defaultErrorCode, getErrorMessage(err));
      } finally {
        logOutcome();
      }
    }

    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<CallToolResult>((resolve) => {
      timeout = setTimeout(() => {
        outcome = 'timeout';
        controller.abort();
        resolve(createTimeoutResponse(timeoutMs));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([execution, timeoutPromise]);
      return result;
    } catch (err) {
      outcome = 'error';
      if (err instanceof ToolFailure) {
        return createErrorResponse(err.code, err.message, err.result);
      }
      return createErrorResponse(defaultErrorCode, getErrorMessage(err));
    } finally {
      if (timeout) clearTimeout(timeout);
      logOutcome();
    }
  };
};

type ParseableSchema<T> = ToolSchema & { parse: (input: unknown) => T };

interface ToolDef {
  name: string;
  options: {
    title: string;
    description: string;
    inputSchema: ToolSchema;
    outputSchema: ToolSchema;
    annotations?: ToolAnnotations;
  };
  handler: (params: unknown) => Promise<CallToolResult>;
}

const defineTool = <TInput, TResult>(spec: {
  name: string;
  title: string;
  description: string;
  inputSchema: ParseableSchema<TInput>;
  outputSchema: ToolSchema;
  annotations?: ToolAnnotations;
  errorCode: string;
  timeoutMs?: number;
  run: (input: TInput, ctx: ToolContext) => MaybePromise<TResult>;
}): ToolDef => {
  return {
    name: spec.name,
    options: {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      outputSchema: spec.outputSchema,
      ...(spec.annotations ? { annotations: spec.annotations } : {}),
    },
    handler: createTimedToolHandler(
      spec.name,
      spec.errorCode,
      spec.timeoutMs ?? TOOL_TIMEOUT_MS,
      async (params, ctx) => {
        const input = spec.inputSchema.parse(params);
        const result = await spec.run(input, ctx);
        return createSuccessResponse(result);
      }
    ),
  };
};

const toCreateMemoryInput = (input: {
  content: string;
  tags: readonly string[];
  importance?: number | undefined;
  memory_type?: CreateMemoryInput['memory_type'] | undefined;
}): CreateMemoryInput => ({
  content: input.content,
  tags: input.tags,
  ...(input.importance === undefined ? {} : { importance: input.importance }),
  ...(input.memory_type === undefined
    ? {}
    : { memory_type: input.memory_type }),
});

const buildTools = (deps: ToolDependencies): ToolDef[] => [
  defineTool({
    name: 'store_memory',
    title: 'Store Memory',
    description: 'Store a new memory with tags',
    inputSchema: StoreMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
    errorCode: 'E_STORE_MEMORY',
    run: async (input) => {
      const result = await deps.createMemory(
        toCreateMemoryInput({
          content: input.content,
          tags: input.tags,
          importance: input.importance,
          memory_type: input.memory_type,
        })
      );
      return result;
    },
  }),

  defineTool({
    name: 'store_memories',
    title: 'Store Multiple Memories',
    description:
      'Store multiple memories in a single batch operation. Returns per-item results with partial success support.',
    inputSchema: StoreMemoriesInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
    errorCode: 'E_STORE_MEMORIES',
    run: async (input, ctx) => {
      const items = input.items.map((item) =>
        toCreateMemoryInput({
          content: item.content,
          tags: item.tags,
          importance: item.importance,
          memory_type: item.memory_type,
        })
      );
      return await deps.createMemories(items, ctx.signal);
    },
  }),

  defineTool({
    name: 'get_memory',
    title: 'Get Memory',
    description: 'Retrieve memory by hash',
    inputSchema: GetMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    errorCode: 'E_GET_MEMORY',
    run: async (input) => {
      const result = await deps.getMemory(normalizeHash(input.hash));
      if (!result) throw new ToolFailure('E_NOT_FOUND', 'Memory not found');
      return result;
    },
  }),

  defineTool({
    name: 'delete_memory',
    title: 'Delete Memory',
    description: 'Delete by hash',
    inputSchema: DeleteMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { destructiveHint: true },
    errorCode: 'E_DELETE_MEMORY',
    run: async (input) => {
      const result = await deps.deleteMemory(normalizeHash(input.hash));
      if (result.changes === 0)
        throw new ToolFailure('E_NOT_FOUND', 'Memory not found');
      return { deleted: true };
    },
  }),

  defineTool({
    name: 'delete_memories',
    title: 'Delete Multiple Memories',
    description:
      'Delete multiple memories by hash in a single batch operation. Returns per-item results with partial success support.',
    inputSchema: DeleteMemoriesInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { destructiveHint: true },
    errorCode: 'E_DELETE_MEMORIES',
    run: async (input, ctx) => {
      return await deps.deleteMemories(
        input.hashes.map(normalizeHash),
        ctx.signal
      );
    },
  }),

  defineTool({
    name: 'update_memory',
    title: 'Update Memory',
    description:
      'Update memory content. Returns new hash since content change affects the hash.',
    inputSchema: UpdateMemoryInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
    errorCode: 'E_UPDATE_MEMORY',
    run: async (input) => {
      return await deps.updateMemory(normalizeHash(input.hash), {
        content: input.content,
        tags: input.tags,
      });
    },
  }),

  defineTool({
    name: 'search_memories',
    title: 'Search Memories',
    description: 'Search memories by content and tags',
    inputSchema: SearchMemoriesInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { readOnlyHint: true },
    errorCode: 'E_SEARCH_MEMORIES',
    run: async (input, ctx) => {
      return await deps.searchMemories({ query: input.query }, ctx.signal);
    },
  }),

  defineTool({
    name: 'recall',
    title: 'Recall Memories',
    description:
      'Search for memories and traverse relationships to return a connected graph cluster. ' +
      'Use this for deeper context retrieval that follows knowledge graph connections.',
    inputSchema: RecallInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { readOnlyHint: true },
    errorCode: 'E_RECALL',
    run: async (input, ctx) => {
      return await deps.recallMemories(
        {
          query: input.query,
          ...(input.depth !== undefined && { depth: input.depth }),
        },
        ctx.signal
      );
    },
  }),

  defineTool({
    name: 'create_relationship',
    title: 'Create Relationship',
    description:
      'Link two memories with a typed relationship. Creates a knowledge graph edge between memories.',
    inputSchema: CreateRelationshipInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { idempotentHint: true },
    errorCode: 'E_CREATE_RELATIONSHIP',
    run: async (input) => {
      return await deps.createRelationship({
        from_hash: normalizeHash(input.from_hash),
        to_hash: normalizeHash(input.to_hash),
        relation_type: input.relation_type,
      });
    },
  }),

  defineTool({
    name: 'get_relationships',
    title: 'Get Relationships',
    description:
      'Get all relationships for a memory. Returns linked memories with relationship types.',
    inputSchema: GetRelationshipsInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { readOnlyHint: true },
    errorCode: 'E_GET_RELATIONSHIPS',
    run: async (input) => {
      return await deps.getRelationships({
        hash: normalizeHash(input.hash),
        ...(input.direction !== undefined && { direction: input.direction }),
      });
    },
  }),

  defineTool({
    name: 'delete_relationship',
    title: 'Delete Relationship',
    description: 'Remove a relationship between two memories.',
    inputSchema: DeleteRelationshipInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { destructiveHint: true },
    errorCode: 'E_DELETE_RELATIONSHIP',
    run: async (input) => {
      const result = await deps.deleteRelationship({
        from_hash: normalizeHash(input.from_hash),
        to_hash: normalizeHash(input.to_hash),
        relation_type: input.relation_type,
      });
      if (result.changes === 0)
        throw new ToolFailure('E_NOT_FOUND', 'Relationship not found');
      return { deleted: true };
    },
  }),

  defineTool({
    name: 'memory_stats',
    title: 'Memory Stats',
    description: 'Database statistics and health',
    inputSchema: MemoryStatsInputSchema,
    outputSchema: DefaultOutputSchema,
    annotations: { readOnlyHint: true },
    errorCode: 'E_MEMORY_STATS',
    run: async () => {
      return await deps.getStats();
    },
  }),
];

export function registerAllTools(
  server: McpServer,
  localIcon?: string,
  deps: ToolDependencies = defaultDeps
): void {
  const tools = buildTools(deps);
  const iconMetadata = localIcon
    ? { icons: [{ src: localIcon, mimeType: 'image/svg+xml', sizes: ['any'] }] }
    : {};

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { ...tool.options, ...iconMetadata },
      tool.handler
    );
  }
}
