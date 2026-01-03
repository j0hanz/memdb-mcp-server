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

const server = new McpServer(
  { name: 'memdb', version: packageJson.version ?? '0.0.0' },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {} },
  }
);

const serverCore = server.server as unknown as {
  _oninitialize?: (request: InitializeRequest) => Promise<InitializeResult>;
};
if (!serverCore._oninitialize) {
  throw new Error('MCP SDK server initialize handler is unavailable');
}
const onInitialize = serverCore._oninitialize;

server.server.setRequestHandler(InitializeRequestSchema, (request) => {
  assertSupportedProtocolVersion(request.params.protocolVersion);
  return onInitialize(request);
});

const serverWithToolError = server as unknown as {
  createToolError: (message: string) => CallToolResult;
};
serverWithToolError.createToolError = (message: string): CallToolResult =>
  createErrorResponse('E_TOOL_ERROR', message);

registerAllTools(server);

let transport: StdioServerTransport | undefined;
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
    transport = new StdioServerTransport();
    await server.connect(transport);
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
