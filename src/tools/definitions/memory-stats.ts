import { getStats } from '../../core/memory-stats.js';
import { MemoryStatsInputSchema } from '../../schemas/inputs.js';
import { DefaultOutputSchema } from '../../schemas/outputs.js';
import { ok, wrapHandler } from '../tool-handlers.js';
import type { ToolDef } from '../tool-types.js';

export const statsTools: ToolDef[] = [
  {
    name: 'memory_stats',
    options: {
      title: 'Memory Stats',
      description: 'Database statistics and health',
      inputSchema: MemoryStatsInputSchema,
      outputSchema: DefaultOutputSchema,
      annotations: { readOnlyHint: true },
    },
    handler: wrapHandler('E_MEMORY_STATS', (params) => {
      MemoryStatsInputSchema.parse(params);
      return ok(getStats());
    }),
  },
];
