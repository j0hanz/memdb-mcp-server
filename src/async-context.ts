import { AsyncLocalStorage } from 'node:async_hooks';

export interface ToolContextStore {
  toolName: string;
  startTime: number;
}

const toolContextStorage = new AsyncLocalStorage<ToolContextStore>();

export const runWithToolContext = <T>(
  store: ToolContextStore,
  fn: () => T
): T => toolContextStorage.run(store, fn);

export const getToolContext = (): ToolContextStore | undefined =>
  toolContextStorage.getStore();
