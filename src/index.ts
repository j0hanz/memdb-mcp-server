#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { closeDb } from './core/database.js';
import { registerAllTools } from './tools/index.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const packageJsonText = await readFile(
  new URL('../package.json', import.meta.url),
  {
    encoding: 'utf-8',
    signal: AbortSignal.timeout(5000),
  }
);
const packageVersion = (() => {
  const parsed: unknown = JSON.parse(packageJsonText);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const version: unknown = Reflect.get(parsed, 'version');
  return typeof version === 'string' ? version : undefined;
})();

const server = new McpServer(
  { name: 'memdb', version: packageVersion ?? '0.0.0' },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {} },
  }
);

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
    transport = stdio;
    await server.connect(stdio);
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
