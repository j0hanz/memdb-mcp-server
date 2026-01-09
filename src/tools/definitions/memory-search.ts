import { searchMemories } from '../../core/memory-search.js';
import { SearchMemoriesInputSchema } from '../../schemas/inputs.js';
import { DefaultOutputSchema } from '../../schemas/outputs.js';
import { ok, wrapHandler } from '../tool-handlers.js';
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
      return ok(searchMemories(input));
    }),
  },
];
