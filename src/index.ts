#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  type CallToolResult,
  ErrorCode,
  type InitializeRequest,
  InitializeRequestSchema,
  type InitializeResult,
  isJSONRPCRequest,
  type JSONRPCMessage,
  type MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';

import { closeDb } from './core/database.js';
import { createErrorResponse } from './lib/errors.js';
import { registerAllTools } from './tools/index.js';
import { logger } from './utils/logger.js';
import { assertSupportedProtocolVersion } from './utils/protocol.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version?: string };

const server = new McpServer(
  { name: 'memdb', version: packageJson.version ?? '0.0.0' },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {} },
  }
);

let hasInitialized = false;

class InitGuardTransport implements Transport {
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage: (
    message: JSONRPCMessage,
    extra?: MessageExtraInfo
  ) => void = () => undefined;

  public constructor(
    private readonly inner: StdioServerTransport,
    private readonly isInitialized: () => boolean
  ) {
    inner.onmessage = (message) => {
      this.handleMessage(message);
    };
    inner.onerror = (error) => {
      this.onerror?.(error);
    };
    inner.onclose = () => {
      this.onclose?.();
    };
  }

  public async start(): Promise<void> {
    await this.inner.start();
  }

  public async send(message: JSONRPCMessage): Promise<void> {
    await this.inner.send(message);
  }

  public async close(): Promise<void> {
    await this.inner.close();
  }

  private handleMessage(
    message: JSONRPCMessage,
    extra?: MessageExtraInfo
  ): void {
    if (!this.isInitialized() && isJSONRPCRequest(message)) {
      if (message.method !== 'initialize') {
        void this.inner
          .send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: ErrorCode.InvalidRequest,
              message: 'Initialize must be the first request.',
            },
          })
          .catch((error: unknown) => {
            const err =
              error instanceof Error ? error : new Error(String(error));
            this.onerror?.(err);
          });
        return;
      }
    }

    this.onmessage(message, extra);
  }
}

const serverCore = server.server as unknown as {
  _oninitialize?: (request: InitializeRequest) => Promise<InitializeResult>;
};
if (!serverCore._oninitialize) {
  throw new Error('MCP SDK server initialize handler is unavailable');
}
const onInitialize = serverCore._oninitialize.bind(server.server);

server.server.setRequestHandler(InitializeRequestSchema, async (request) => {
  assertSupportedProtocolVersion(request.params.protocolVersion);
  // Preserve "this" binding for the MCP SDK's private handler.
  const result = await onInitialize(request);
  hasInitialized = true;
  return result;
});

const serverWithToolError = server as unknown as {
  createToolError: (message: string) => CallToolResult;
};
serverWithToolError.createToolError = (message: string): CallToolResult =>
  createErrorResponse('E_TOOL_ERROR', message);

registerAllTools(server);

let transport: Transport | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 5000);

  const exit = (code: number): void => {
    clearTimeout(forceExitTimer);
    process.exit(code);
  };

  try {
    closeDb();
    if (transport) {
      await transport.close();
    }
    exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    exit(1);
  }
}

async function main(): Promise<void> {
  try {
    const stdio = new StdioServerTransport();
    const guardedTransport = new InitGuardTransport(
      stdio,
      () => hasInitialized
    );
    transport = guardedTransport;
    await server.connect(guardedTransport);
    logger.info('Memory MCP Server running on stdio');
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void main();

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGBREAK', () => void shutdown('SIGBREAK'));

process.on('uncaughtException', (err, origin) => {
  logger.error(`Uncaught exception (${origin}):`, err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});
