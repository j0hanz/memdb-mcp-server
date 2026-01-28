#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';

import pkg from '../package.json' with { type: 'json' };
import { closeDb, initDb } from './core/db.js';
import { attachProtocolLogger, logger } from './logger.js';
import { ProtocolVersionGuardTransport } from './protocol-version-guard.js';
import { BatchRejectingStdioServerTransport } from './stdio-transport.js';
import { registerAllTools } from './tools.js';

const readPackageVersion = (): Promise<string | undefined> => {
  const { version } = pkg as { version?: unknown };
  return Promise.resolve(typeof version === 'string' ? version : undefined);
};

const toNonEmptyTrimmedOrUndefined = (text: string): string | undefined => {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readTextFileOrUndefined = async (
  url: URL
): Promise<string | undefined> => {
  try {
    return await readFile(url, {
      encoding: 'utf-8',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return undefined;
  }
};

const readServerInstructions = async (): Promise<string | undefined> => {
  const text = await readTextFileOrUndefined(
    new URL('./instructions.md', import.meta.url)
  );
  if (!text) return undefined;
  return toNonEmptyTrimmedOrUndefined(text);
};

const loadServerMetadata = async (): Promise<{
  packageVersion: string | undefined;
  instructions: string;
}> => {
  const [packageVersion, instructions] = await Promise.all([
    readPackageVersion(),
    readServerInstructions(),
  ]);
  return {
    packageVersion,
    instructions:
      instructions ?? 'A Memory MCP Server for AI Assistants using node:sqlite',
  };
};

const { packageVersion, instructions: serverInstructions } =
  await loadServerMetadata();

const server = new McpServer(
  { name: 'memdb', version: packageVersion ?? '0.0.0' },
  {
    instructions: serverInstructions,
    capabilities: { tools: {}, logging: {}, resources: {} },
  }
);

const instructionsResource = new ResourceTemplate('internal://instructions', {
  list: undefined,
});

server.registerResource(
  'internal://instructions',
  instructionsResource,
  { title: 'Instructions', mimeType: 'text/markdown' },
  async (uri) => {
    const text =
      (await readTextFileOrUndefined(
        new URL('./instructions.md', import.meta.url)
      )) ?? serverInstructions;
    return {
      contents: [
        {
          uri: uri.href,
          text,
          mimeType: 'text/markdown',
        },
      ],
    };
  }
);

registerAllTools(server);

let transport: Transport | undefined;
let shuttingDown = false;

const SHUTDOWN_TIMEOUT = 5000;

const createShutdownTimer = (): NodeJS.Timeout => {
  return setTimeout(() => {
    logger.warn('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
};

const closeServerResources = async (): Promise<void> => {
  closeDb();
  await transport?.close();
};

const clearTimerAndExit = (timer: NodeJS.Timeout, code: number): never => {
  clearTimeout(timer);
  process.exit(code);
};

const exitWithShutdownTimer = (
  timer: NodeJS.Timeout,
  code: number,
  error?: unknown
): void => {
  if (error !== undefined) {
    logger.error('Error during shutdown:', error);
  }
  clearTimerAndExit(timer, code);
};

const beginShutdown = (signal: NodeJS.Signals): void => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  const forceExitTimer = createShutdownTimer();

  void closeServerResources()
    .then(() => {
      exitWithShutdownTimer(forceExitTimer, 0);
    })
    .catch((err: unknown) => {
      exitWithShutdownTimer(forceExitTimer, 1, err);
    });
};

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  beginShutdown(signal);
}

const createTransport = (): Transport => {
  const stdioTransport = new BatchRejectingStdioServerTransport();
  const supportedProtocolVersions = SUPPORTED_PROTOCOL_VERSIONS.filter(
    (version) => version !== '2025-03-26'
  );
  return new ProtocolVersionGuardTransport(
    stdioTransport,
    supportedProtocolVersions
  );
};

const attachMcpLogger = (target: McpServer): void => {
  attachProtocolLogger((level, message) => {
    if (!target.isConnected()) return;
    void target
      .sendLoggingMessage({
        level,
        data: message,
        logger: 'memdb',
      })
      .catch(() => {});
  });
};

const connectServer = async (transportToUse: Transport): Promise<void> => {
  transport = transportToUse;
  await server.connect(transportToUse);
  attachMcpLogger(server);
  logger.info('Memory MCP Server running on stdio');
};

const main = async (): Promise<void> => {
  try {
    await initDb();
    const guardedTransport = createTransport();
    await connectServer(guardedTransport);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

const registerSignalHandlers = (): void => {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGBREAK'];
  for (const signal of signals) {
    process.on(signal, () => {
      shutdown(signal);
    });
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
