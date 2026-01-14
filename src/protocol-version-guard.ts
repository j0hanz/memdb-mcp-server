import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  isInitializedNotification,
  isInitializeRequest,
  isJSONRPCErrorResponse,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  type MessageExtraInfo,
  type RequestId,
} from '@modelcontextprotocol/sdk/types.js';

const buildUnsupportedVersionMessage = (
  version: string,
  supportedVersions: readonly string[]
): string =>
  `Unsupported protocol version: ${version} (supported versions: ${supportedVersions.join(', ')})`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const rejectBatchIfPresent = (message: unknown, inner: Transport): boolean => {
  if (!Array.isArray(message)) return false;
  for (const item of message) {
    if (!isObject(item)) continue;
    const id: unknown = Reflect.get(item, 'id');
    if (typeof id !== 'string' && typeof id !== 'number') continue;
    void inner.send(
      createLifecycleError(
        id,
        'Invalid request: JSON-RPC batching is not supported'
      ),
      { relatedRequestId: id }
    );
  }
  return true;
};

const getInitializeInfo = (
  message: JSONRPCMessage
): { id: RequestId; protocolVersion: string } | undefined => {
  if (!isInitializeRequest(message)) return undefined;
  const { params, id } = message as {
    params?: unknown;
    id?: unknown;
  };
  if (typeof id !== 'string' && typeof id !== 'number') return undefined;
  if (!isObject(params)) return undefined;
  const { protocolVersion } = params as { protocolVersion?: unknown };
  if (typeof protocolVersion !== 'string') return undefined;
  return { id, protocolVersion };
};

const createUnsupportedVersionError = (
  id: RequestId,
  version: string,
  supportedVersions: readonly string[]
): JSONRPCMessage => ({
  jsonrpc: '2.0',
  id,
  error: {
    code: -32000,
    message: buildUnsupportedVersionMessage(version, supportedVersions),
  },
});

const createLifecycleError = (
  id: RequestId,
  message: string
): JSONRPCMessage => ({
  jsonrpc: '2.0',
  id,
  error: {
    code: -32600,
    message,
  },
});

export class ProtocolVersionGuardTransport implements Transport {
  readonly inner: Transport;
  private readonly supportedVersions: readonly string[];
  onclose: () => void = () => {};
  onerror: (error: Error) => void = () => {};
  onmessage: NonNullable<Transport['onmessage']> = () => {};
  private sawInitialize = false;
  private ready = false;

  constructor(inner: Transport, supportedVersions: readonly string[]) {
    this.inner = inner;
    this.supportedVersions = supportedVersions;
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }

  async start(): Promise<void> {
    this.inner.onmessage = (message, extra): void => {
      this.handleMessage(message, extra);
    };
    this.inner.onerror = (error): void => {
      this.onerror(error);
    };
    this.inner.onclose = (): void => {
      this.onclose();
    };
    await this.inner.start();
  }

  async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions
  ): Promise<void> {
    await this.inner.send(message, options);
  }

  async close(): Promise<void> {
    await this.inner.close();
  }

  private handleMessage(
    message: JSONRPCMessage,
    extra?: MessageExtraInfo
  ): void {
    if (rejectBatchIfPresent(message as unknown, this.inner)) {
      return;
    }

    const initializeInfo = getInitializeInfo(message);
    if (initializeInfo) {
      this.handleInitialize(message, initializeInfo, extra);
      return;
    }

    if (isInitializedNotification(message)) {
      this.handleInitializedNotification(message, extra);
      return;
    }

    if (!this.sawInitialize || !this.ready) {
      this.handleBeforeReady(message, extra);
      return;
    }

    this.onmessage(message, extra);
  }

  private handleInitialize(
    message: JSONRPCMessage,
    initializeInfo: { id: RequestId; protocolVersion: string },
    extra?: MessageExtraInfo
  ): void {
    if (this.sawInitialize) {
      void this.inner.send(
        createLifecycleError(
          initializeInfo.id,
          'Invalid request: initialize already received'
        ),
        { relatedRequestId: initializeInfo.id }
      );
      return;
    }

    if (!this.supportedVersions.includes(initializeInfo.protocolVersion)) {
      void this.inner.send(
        createUnsupportedVersionError(
          initializeInfo.id,
          initializeInfo.protocolVersion,
          this.supportedVersions
        ),
        { relatedRequestId: initializeInfo.id }
      );
      return;
    }

    this.sawInitialize = true;
    this.onmessage(message, extra);
  }

  private handleInitializedNotification(
    message: JSONRPCMessage,
    extra?: MessageExtraInfo
  ): void {
    if (!this.sawInitialize) return;
    if (this.ready) return;

    this.ready = true;
    this.onmessage(message, extra);
  }

  private handleBeforeReady(
    message: JSONRPCMessage,
    extra?: MessageExtraInfo
  ): void {
    if (isJSONRPCRequest(message)) {
      void this.inner.send(
        createLifecycleError(
          message.id,
          'Invalid request: initialize must be sent before other requests'
        ),
        { relatedRequestId: message.id }
      );
      return;
    }

    if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
      this.onmessage(message, extra);
    }
  }
}
