import { createMemory } from '../../core/memory-create.js';
import { deleteMemory, getMemory } from '../../core/memory-read.js';
import { updateMemory } from '../../core/memory-updates.js';
import { createErrorResponse } from '../../lib/errors.js';
import {
  DeleteMemoryInputSchema,
  GetMemoryInputSchema,
  StoreMemoryInputSchema,
  UpdateMemoryInputSchema,
} from '../../schemas/inputs.js';
import { DefaultOutputSchema } from '../../schemas/outputs.js';
import { ok, wrapHandler } from '../tool-helpers.js';
import type { ToolDef } from '../tool-types.js';

export const coreTools: ToolDef[] = [
  {
    name: 'store_memory',
    options: {
      title: 'Store Memory',
      description: 'Store a new memory with optional tags',
      inputSchema: StoreMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_STORE_MEMORY', (params) => {
      const input = StoreMemoryInputSchema.parse(params);
      return ok(
        createMemory({
          content: input.content,
          tags: input.tags ?? [],
          importance: input.importance ?? 0,
          memoryType: input.memoryType ?? 'general',
        })
      );
    }),
  },
  {
    name: 'get_memory',
    options: {
      title: 'Get Memory',
      description: 'Retrieve memory by hash',
      inputSchema: GetMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_GET_MEMORY', (params) => {
      const input = GetMemoryInputSchema.parse(params);
      const result = getMemory(input.hash);
      if (!result) {
        return createErrorResponse('E_NOT_FOUND', 'Memory not found');
      }
      return ok(result);
    }),
  },
  {
    name: 'delete_memory',
    options: {
      title: 'Delete Memory',
      description: 'Delete by hash',
      inputSchema: DeleteMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { destructiveHint: true },
    },
    handler: wrapHandler('E_DELETE_MEMORY', (params) => {
      const input = DeleteMemoryInputSchema.parse(params);
      const result = deleteMemory(input.hash);
      if (result.changes === 0) {
        return createErrorResponse('E_NOT_FOUND', 'Memory not found');
      }
      return ok({ deleted: true });
    }),
  },
  {
    name: 'update_memory',
    options: {
      title: 'Update Memory',
      description:
        'Update memory metadata (importance, type, tags). Content cannot be changed.',
      inputSchema: UpdateMemoryInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_UPDATE_MEMORY', (params) => {
      const input = UpdateMemoryInputSchema.parse(params);
      const { hash, ...options } = input;
      return ok(updateMemory(hash, options));
    }),
  },
];
