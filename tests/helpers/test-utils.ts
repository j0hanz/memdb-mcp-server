import type { TestContext } from 'node:test';

export const skipIfMissingThrowIfAborted = (t: TestContext): boolean => {
  const controller = new AbortController();
  const hasThrowIfAborted =
    typeof controller.signal.throwIfAborted === 'function';

  if (!hasThrowIfAborted) {
    t.skip('throwIfAborted not available in this Node version');
    return true;
  }

  return false;
};
