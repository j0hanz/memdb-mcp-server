#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { closeDb } from './core/db.js';
import { logger } from './logger.js';
import { ProtocolVersionGuardTransport } from './protocol-version-guard.js';
import { registerAllTools } from './tools.js';
import {
  createDbWorkerClient,
  createWorkerToolDependencies,
} from './worker/db-worker-client.js';

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

const packageVersion = await readPackageVersion();
const server = new McpServer(
  { name: 'memdb', version: packageVersion ?? '0.0.0' },
  {
    instructions: 'A Memory MCP Server for AI Assistants using node:sqlite',
    capabilities: { logging: {}, tools: {} },
  }
);

let workerClient: ReturnType<typeof createDbWorkerClient> | undefined;
if (config.dbWorker) {
  workerClient = createDbWorkerClient();
  registerAllTools(server, createWorkerToolDependencies(workerClient));
  logger.info('Database worker enabled');
} else {
  registerAllTools(server);
}

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
  try {
    await workerClient?.close();
    closeDb();
    await transport?.close();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

const main = async (): Promise<void> => {
  try {
    const stdioTransport = new StdioServerTransport();
    const guardedTransport = new ProtocolVersionGuardTransport(
      stdioTransport,
      SUPPORTED_PROTOCOL_VERSIONS
    );
    transport = guardedTransport;
    await server.connect(guardedTransport);
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
