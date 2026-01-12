import process from 'node:process';

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import { JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';

const MAX_LINE_BYTES = 16 * 1024 * 1024;

class LineBuffer {
  private chunks: Buffer[] = [];
  private totalLength = 0;

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.totalLength += chunk.length;
  }

  readLine(): string | null {
    if (this.totalLength === 0) return null;

    const found = this.findNewline();
    if (!found) {
      this.assertLineLength(this.totalLength);
      return null;
    }

    const lineLength = found.offset + found.newlineIndex;
    this.assertLineLength(lineLength);
    const lineBuffer = this.buildLineBuffer(
      found.chunkIndex,
      found.newlineIndex,
      lineLength
    );
    this.consumeLine(found.chunkIndex, found.newlineIndex, lineLength);
    return lineBuffer.toString('utf8').replace(/\r$/, '');
  }

  private assertLineLength(length: number): void {
    if (length > this.maxBytes) {
      throw new Error('Input line exceeds maximum size');
    }
  }

  private findNewline(): {
    chunkIndex: number;
    newlineIndex: number;
    offset: number;
  } | null {
    let offset = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      if (!chunk) continue;
      const newlineIndex = chunk.indexOf('\n');
      if (newlineIndex !== -1) {
        return { chunkIndex: i, newlineIndex, offset };
      }
      offset += chunk.length;
    }
    return null;
  }

  private buildLineBuffer(
    chunkIndex: number,
    newlineIndex: number,
    lineLength: number
  ): Buffer {
    const lineBuffer = Buffer.allocUnsafe(lineLength);
    let writeOffset = 0;
    for (let i = 0; i < chunkIndex; i++) {
      const part = this.chunks[i];
      if (!part) continue;
      part.copy(lineBuffer, writeOffset);
      writeOffset += part.length;
    }
    const chunk = this.chunks[chunkIndex];
    if (chunk && newlineIndex > 0) {
      chunk.copy(lineBuffer, writeOffset, 0, newlineIndex);
    }
    return lineBuffer;
  }

  private consumeLine(
    chunkIndex: number,
    newlineIndex: number,
    lineLength: number
  ): void {
    const remaining: Buffer[] = [];
    const chunk = this.chunks[chunkIndex];
    if (chunk) {
      const rest = chunk.subarray(newlineIndex + 1);
      if (rest.length > 0) remaining.push(rest);
    }
    for (let i = chunkIndex + 1; i < this.chunks.length; i++) {
      const tail = this.chunks[i];
      if (!tail) continue;
      remaining.push(tail);
    }

    this.chunks = remaining;
    this.totalLength -= lineLength + 1;
  }

  clear(): void {
    this.chunks = [];
    this.totalLength = 0;
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
  private readonly readBuffer = new LineBuffer(MAX_LINE_BYTES);
  private started = false;

  // Arrow functions keep identity for off().
  private readonly onData = (chunk: Buffer): void => {
    try {
      this.readBuffer.append(chunk);
      this.processReadBuffer();
    } catch (error) {
      this.onerror(error instanceof Error ? error : new Error(String(error)));
    }
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
    try {
      for (
        let line = this.readBuffer.readLine();
        line !== null;
        line = this.readBuffer.readLine()
      ) {
        try {
          this.handleLine(line);
        } catch (error) {
          this.onerror(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    } catch {
      this.readBuffer.clear();
      this.sendParseError();
    }
  }
}
