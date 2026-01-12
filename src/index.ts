#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  type CallToolResult,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

import { closeDb } from './core/db.js';
import { logger } from './logger.js';
import { ProtocolVersionGuardTransport } from './protocol-version-guard.js';
import { BatchRejectingStdioServerTransport } from './stdio-transport.js';
import { registerAllTools } from './tools.js';

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
    capabilities: { tools: {} },
  }
);

const patchToolErrorResults = (target: McpServer): void => {
  const targetUnknown = target as unknown as Record<string, unknown>;
  const existing: unknown = Reflect.get(targetUnknown, 'createToolError');
  if (existing !== undefined && typeof existing !== 'function') return;

  const createToolError = (message: string): CallToolResult => {
    const structured = {
      ok: false,
      error: { code: 'E_TOOL_ERROR', message },
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(structured) }],
      structuredContent: structured,
      isError: true,
    };
  };

  Reflect.set(targetUnknown, 'createToolError', createToolError);
};

patchToolErrorResults(server);
registerAllTools(server);

let transport: Transport | undefined;
let shuttingDown = false;

const SHUTDOWN_TIMEOUT = 5000;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
  try {
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
    const stdioTransport = new BatchRejectingStdioServerTransport();
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
