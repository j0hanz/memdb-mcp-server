import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  isInitializeRequest,
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

export class ProtocolVersionGuardTransport implements Transport {
  readonly inner: Transport;
  private readonly supportedVersions: readonly string[];
  onclose: () => void = () => {};
  onerror: (error: Error) => void = () => {};
  onmessage: NonNullable<Transport['onmessage']> = () => {};

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
    const initializeInfo = getInitializeInfo(message);
    if (
      initializeInfo &&
      !this.supportedVersions.includes(initializeInfo.protocolVersion)
    ) {
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
    this.onmessage(message, extra);
  }
}
