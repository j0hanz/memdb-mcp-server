import { format } from 'node:util';

import { getToolContext, type ToolContextStore } from './async-context.js';
import { config } from './config.js';

type LogLevel = 'error' | 'info' | 'warn';
type ProtocolLogLevel = 'info' | 'warning' | 'error';
type ProtocolLogSink = (level: ProtocolLogLevel, message: string) => void;

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const threshold = LEVELS[config.logLevel];

let protocolLogSink: ProtocolLogSink | undefined;

const toProtocolLogLevel = (level: LogLevel): ProtocolLogLevel => {
  switch (level) {
    case 'warn':
      return 'warning';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
  }
};

const formatLogMessage = (msg: string, args: readonly unknown[]): string =>
  args.length === 0 ? msg : format(msg, ...args);

const formatContextPrefix = (context: ToolContextStore | undefined): string =>
  context ? `[tool:${context.toolName}] ` : '';

const createWriter =
  (level: LogLevel) =>
  (msg: string, ...args: unknown[]): void => {
    if (LEVELS[level] > threshold) return;
    const formatted = formatLogMessage(msg, args);
    const context = getToolContext();
    const withContext = `${formatContextPrefix(context)}${formatted}`;
    console.error(`[${level.toUpperCase()}] ${withContext}`);
    protocolLogSink?.(toProtocolLogLevel(level), withContext);
  };

export const attachProtocolLogger = (
  sink: ProtocolLogSink | undefined
): void => {
  protocolLogSink = sink;
};

export const logger = {
  info: createWriter('info'),
  warn: createWriter('warn'),
  error: createWriter('error'),
};
