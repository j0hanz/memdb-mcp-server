import { format } from 'node:util';

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

const createWriter =
  (level: LogLevel) =>
  (msg: string, ...args: unknown[]): void => {
    if (LEVELS[level] > threshold) return;
    console.error(`[${level.toUpperCase()}] ${msg}`, ...args);
    const formatted = formatLogMessage(msg, args);
    protocolLogSink?.(toProtocolLogLevel(level), formatted);
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
