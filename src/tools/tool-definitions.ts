import { coreTools } from './definitions/memory-core.js';
import { relationTools } from './definitions/memory-relations.js';
import { searchTools } from './definitions/memory-search.js';
import { statsTools } from './definitions/memory-stats.js';
import type { ToolDef } from './tool-types.js';

export const tools: ToolDef[] = [
  ...coreTools,
  ...searchTools,
  ...relationTools,
  ...statsTools,
];
