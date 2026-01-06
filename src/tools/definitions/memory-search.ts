import { searchMemories } from '../../core/memory-search.js';
import { SearchMemoriesInputSchema } from '../../schemas/inputs.js';
import { DefaultOutputSchema } from '../../schemas/outputs.js';
import { ok, wrapHandler } from '../tool-helpers.js';
import type { ToolDef } from '../tool-types.js';

export const searchTools: ToolDef[] = [
  {
    name: 'search_memories',
    options: {
      title: 'Search Memories',
      description: 'Full-text search with filters',
      inputSchema: SearchMemoriesInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_SEARCH_MEMORIES', (params) => {
      const input = SearchMemoriesInputSchema.parse(params);
      const searchInput = {
        query: input.query,
        limit: input.limit ?? 10,
        tags: input.tags ?? [],
        ...(input.minRelevance !== undefined
          ? { minRelevance: input.minRelevance }
          : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      };
      return ok(searchMemories(searchInput));
    }),
  },
];
