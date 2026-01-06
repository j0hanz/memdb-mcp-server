#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
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
  type JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';

import { closeDb } from './core/database.js';
import { createErrorResponse } from './lib/errors.js';
import { registerAllTools } from './tools/index.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { assertSupportedProtocolVersion } from './utils/protocol.js';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf-8')
) as { version?: string };

const server = new McpServer(
  { name: 'memdb', version: packageJson.version ?? '0.0.0' },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {} },
  }
);

let hasInitialized = false;

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

const createInitGuardTransport = (input: {
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

// HACK: Accessing internal _oninitialize to intercept protocol version validation.
// This is necessary because the MCP SDK doesn't expose a public hook for this.
// Tested with @modelcontextprotocol/sdk ^1.25.1. May break on major SDK updates.
// Runtime check below ensures graceful failure if SDK internals change.
const serverCore = server.server as unknown as {
  _oninitialize?: (request: InitializeRequest) => Promise<InitializeResult>;
};
const onInitialize = serverCore._oninitialize;
if (!onInitialize) {
  throw new Error('MCP SDK server initialize handler is unavailable');
}

server.server.setRequestHandler(InitializeRequestSchema, async (request) => {
  assertSupportedProtocolVersion(request.params.protocolVersion);
  const result = await onInitialize.call(server.server, request);
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
  }, config.shutdownTimeout);

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
    const guardedTransport = createInitGuardTransport({
      inner: stdio,
      isInitialized: () => hasInitialized,
    });
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
