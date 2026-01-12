import process from 'node:process';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

class LineBuffer {
  private buffer: Buffer | undefined;

  append(chunk: Buffer): void {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
  }

  readLine(): string | null {
    if (!this.buffer) return null;

    const index = this.buffer.indexOf('\n');
    if (index === -1) return null;

    const line = this.buffer.toString('utf8', 0, index).replace(/\r$/, '');
    this.buffer = this.buffer.subarray(index + 1);
    return line;
  }

  clear(): void {
    this.buffer = undefined;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

type RequestIdResult =
  | { ok: true; id: RequestId }
  | {
      ok: false;
      reason: 'missing' | 'invalid-type';
    };

const getRequestIdResult = (value: unknown): RequestIdResult => {
  if (!isObject(value)) return { ok: false, reason: 'missing' };
  const candidate: unknown = Reflect.get(value, 'id');
  if (candidate === undefined) return { ok: false, reason: 'missing' };
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return { ok: true, id: candidate };
  }
  return { ok: false, reason: 'invalid-type' };
};

const invalidRequestError = (id?: RequestId): JSONRPCMessage =>
  id === undefined
    ? {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid request',
        },
      }
    : {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32600,
          message: 'Invalid request',
        },
      };

const parseError = (): JSONRPCMessage => ({
  jsonrpc: '2.0',
  error: {
    code: -32700,
    message: 'Parse error',
  },
});

/**
 * Stdio transport that explicitly rejects JSON-RPC batch arrays.
 *
 * MCP protocol revisions >= 2025-06-18 removed JSON-RPC batching; servers must reject array payloads.
 */
export class BatchRejectingStdioServerTransport implements Transport {
  onclose: () => void = () => {};
  onerror: (error: Error) => void = () => {};
  onmessage: NonNullable<Transport['onmessage']> = () => {};

  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WritableStream;
  private readonly readBuffer = new LineBuffer();
  private started = false;

  // Arrow functions keep identity for off().
  private readonly onData = (chunk: Buffer): void => {
    this.readBuffer.append(chunk);
    this.processReadBuffer();
  };

  private readonly onStdinError = (error: Error): void => {
    this.onerror(error);
  };

  constructor(
    stdin: NodeJS.ReadableStream = process.stdin,
    stdout: NodeJS.WritableStream = process.stdout
  ) {
    this.stdin = stdin;
    this.stdout = stdout;
  }

  start(): Promise<void> {
    if (this.started) {
      throw new Error(
        'BatchRejectingStdioServerTransport already started! If using McpServer.connect(), note that connect() calls start() automatically.'
      );
    }
    this.started = true;
    this.stdin.on('data', this.onData);
    this.stdin.on('error', this.onStdinError);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.stdin.off('data', this.onData);
    this.stdin.off('error', this.onStdinError);

    const remainingDataListeners = this.stdin.listenerCount('data');
    if (remainingDataListeners === 0) {
      this.stdin.pause();
    }

    this.readBuffer.clear();
    this.onclose();
    return Promise.resolve();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve) => {
      const json = `${JSON.stringify(message)}\n`;
      if (this.stdout.write(json)) {
        resolve();
      } else {
        this.stdout.once('drain', resolve);
      }
    });
  }

  private sendInvalidRequest(id: RequestId): void {
    void this.send(invalidRequestError(id));
  }

  private sendInvalidRequestUnknownId(): void {
    void this.send(invalidRequestError());
  }

  private sendParseError(): void {
    void this.send(parseError());
  }

  private handleBatch(raw: unknown[]): void {
    let sentAny = false;
    for (const item of raw) {
      const idResult = getRequestIdResult(item);
      if (!idResult.ok) continue;
      this.sendInvalidRequest(idResult.id);
      sentAny = true;
    }
    if (!sentAny) {
      this.sendInvalidRequestUnknownId();
    }
  }

  private handleNonBatch(raw: unknown): void {
    const idResult = getRequestIdResult(raw);
    if (idResult.ok) {
      this.sendInvalidRequest(idResult.id);
      return;
    }
    if (idResult.reason === 'invalid-type') {
      this.sendInvalidRequestUnknownId();
    }
  }

  private handleLine(line: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      this.sendParseError();
      return;
    }
    if (Array.isArray(raw)) {
      this.handleBatch(raw);
      return;
    }

    const parsed = JSONRPCMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.handleNonBatch(raw);
      return;
    }

    this.onmessage(parsed.data);
  }

  private processReadBuffer(): void {
    let line: string | null;
    while ((line = this.readBuffer.readLine()) !== null) {
      try {
        this.handleLine(line);
      } catch (error) {
        this.onerror(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}
