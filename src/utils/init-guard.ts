import type { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ErrorCode,
  isJSONRPCRequest,
  type JSONRPCMessage,
  type JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';

const sendInitRequiredError = (input: {
  inner: StdioServerTransport;
  message: JSONRPCRequest;
  guarded: Transport;
}): void => {
  const { inner, message, guarded } = input;
  void inner
    .send({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: ErrorCode.InvalidRequest,
        message: 'Initialize must be the first request.',
      },
    })
    .catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      guarded.onerror?.(err);
    });
};

const handleInitGuardMessage = (input: {
  message: JSONRPCMessage;
  isInitialized: () => boolean;
  inner: StdioServerTransport;
  guarded: Transport;
}): void => {
  const { message, isInitialized, inner, guarded } = input;
  if (!isInitialized() && isJSONRPCRequest(message)) {
    if (message.method !== 'initialize') {
      sendInitRequiredError({ inner, message, guarded });
      return;
    }
  }

  guarded.onmessage?.(message);
};

export const createInitGuardTransport = (input: {
  inner: StdioServerTransport;
  isInitialized: () => boolean;
}): Transport => {
  const { inner, isInitialized } = input;
  const guarded: Transport = {
    onmessage: () => undefined,
    start: async (): Promise<void> => inner.start(),
    send: async (message: JSONRPCMessage): Promise<void> => inner.send(message),
    close: async (): Promise<void> => inner.close(),
  };

  inner.onmessage = (message: JSONRPCMessage) => {
    handleInitGuardMessage({
      message,
      isInitialized,
      inner,
      guarded,
    });
  };
  inner.onerror = (error) => {
    guarded.onerror?.(error);
  };
  inner.onclose = () => {
    guarded.onclose?.();
  };

  return guarded;
};
