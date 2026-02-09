export const throwIfAborted = (signal?: AbortSignal): void => {
  signal?.throwIfAborted();
};
