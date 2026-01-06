import { getRelated, linkMemories } from '../../core/memory-relations.js';
import {
  type GetRelatedInput,
  GetRelatedInputSchema,
  type LinkMemoriesInput,
  LinkMemoriesInputSchema,
} from '../../schemas/inputs.js';
import { DefaultOutputSchema } from '../../schemas/outputs.js';
import { ok, wrapHandler } from '../tool-helpers.js';
import type { ToolDef } from '../tool-types.js';

export const relationTools: ToolDef[] = [
  {
    name: 'link_memories',
    options: {
      title: 'Link Memories',
      description: 'Create relationship between memories',
      inputSchema: LinkMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { idempotentHint: true },
    },
    handler: wrapHandler('E_LINK_MEMORIES', (params) => {
      const input = params as LinkMemoriesInput;
      linkMemories(input.fromHash, input.toHash, input.relationType);
      return ok({ linked: true });
    }),
  },
  {
    name: 'get_related',
    options: {
      title: 'Get Related Memories',
      description: 'Get memories related to a given memory',
      inputSchema: GetRelatedInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_GET_RELATED', (params) => {
      const input = params as GetRelatedInput;
      const relatedInput = {
        hash: input.hash,
        depth: input.depth ?? 1,
        direction: input.direction ?? 'outgoing',
        ...(input.relationType !== undefined
          ? { relationType: input.relationType }
          : {}),
      };
      return ok(getRelated(relatedInput));
    }),
  },
];
