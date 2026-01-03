#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type CallToolResult,
  type InitializeRequest,
  InitializeRequestSchema,
  type InitializeResult,
} from '@modelcontextprotocol/sdk/types.js';

import { closeDb } from './core/database.js';
import { createErrorResponse } from './lib/errors.js';
import { registerAllTools } from './tools/index.js';
import { logger } from './utils/logger.js';
import { assertSupportedProtocolVersion } from './utils/protocol.js';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as { version?: string };
const SERVER_VERSION = packageJson.version ?? '0.0.0';

const server = new McpServer(
  { name: 'memdb', version: SERVER_VERSION },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {} },
  }
);

interface ServerWithInitialize {
  _oninitialize: (request: InitializeRequest) => Promise<InitializeResult>;
}

const isServerWithInitialize = (
  value: unknown
): value is ServerWithInitialize =>
  typeof value === 'object' &&
  value !== null &&
  '_oninitialize' in value &&
  typeof (value as { _oninitialize?: unknown })._oninitialize === 'function';

const serverCore = server.server;
if (!isServerWithInitialize(serverCore)) {
  throw new Error('MCP SDK server initialize handler is unavailable');
}
const serverCoreWithInitialize: ServerWithInitialize = serverCore;

server.server.setRequestHandler(InitializeRequestSchema, (request) => {
  const requestedVersion = request.params.protocolVersion;
  assertSupportedProtocolVersion(requestedVersion);
  return serverCoreWithInitialize._oninitialize(request);
});

// Ensure tool errors always include structuredContent (matches DefaultOutputSchema).
const serverWithToolError = server as unknown as {
  createToolError: (message: string) => CallToolResult;
};
serverWithToolError.createToolError = (message: string): CallToolResult =>
  createErrorResponse('E_TOOL_ERROR', message);

registerAllTools(server);

let transport: StdioServerTransport | undefined;
let shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    closeDb();
    if (transport) {
      await transport.close();
    }
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('Memory MCP Server running on stdio');
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void main();

// Graceful shutdown handlers
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGBREAK', () => void shutdown('SIGBREAK'));

// Uncaught error handlers
process.on('uncaughtException', (err, origin) => {
  logger.error(`Uncaught exception (${origin}):`, err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});
