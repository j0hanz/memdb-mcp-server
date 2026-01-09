#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { closeDb } from './core/database.js';
import { registerAllTools } from './tools/index.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';

const readPackageVersion = async (): Promise<string | undefined> => {
  const packageJsonText = await readFile(
    new URL('../package.json', import.meta.url),
    {
      encoding: 'utf-8',
      signal: AbortSignal.timeout(5000),
    }
  );
  const parsed: unknown = JSON.parse(packageJsonText);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const version: unknown = Reflect.get(parsed, 'version');
  return typeof version === 'string' ? version : undefined;
};

const createServer = (version: string | undefined): McpServer => {
  return new McpServer(
    { name: 'memdb', version: version ?? '0.0.0' },
    {
      instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
      capabilities: { logging: {}, tools: {} },
    }
  );
};

const closeTransport = async (
  transport: StdioServerTransport | undefined
): Promise<void> => {
  if (!transport) return;
  await transport.close();
};

const runShutdown = async (
  transport: StdioServerTransport | undefined
): Promise<number> => {
  try {
    closeDb();
    await closeTransport(transport);
    return 0;
  } catch (err) {
    logger.error('Error during shutdown:', err);
    return 1;
  }
};

const scheduleForceExit = (timeoutMs: number): NodeJS.Timeout => {
  return setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, timeoutMs);
};

const exitWithTimer = (timer: NodeJS.Timeout, code: number): void => {
  clearTimeout(timer);
  process.exit(code);
};

const packageVersion = await readPackageVersion();
const server = createServer(packageVersion);

registerAllTools(server);

let transport: StdioServerTransport | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = scheduleForceExit(config.shutdownTimeout);
  const code = await runShutdown(transport);
  exitWithTimer(forceExitTimer, code);
}

const startServer = async (): Promise<void> => {
  const stdio = new StdioServerTransport();
  transport = stdio;
  await server.connect(stdio);
};

const main = async (): Promise<void> => {
  try {
    await startServer();
    logger.info('Memory MCP Server running on stdio');
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

const registerSignalHandlers = (): void => {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGBREAK'];
  for (const signal of signals) {
    process.on(signal, () => void shutdown(signal));
  }
};

const registerProcessHandlers = (): void => {
  process.on('uncaughtException', (err, origin) => {
    logger.error(`Uncaught exception (${origin}):`, err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    process.exit(1);
  });
};

void main();
registerSignalHandlers();
registerProcessHandlers();
