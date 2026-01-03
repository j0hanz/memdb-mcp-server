import { config, type LogLevel } from './config.js';

interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}

const levels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

export const createLogger = (logLevel: LogLevel): Logger => {
  const threshold = levels[logLevel];
  const log = (level: LogLevel, msg: string, ...args: unknown[]): void => {
    if (levels[level] > threshold) return;
    console.error(`[${level.toUpperCase()}] ${msg}`, ...args);
  };

  return {
    info: (msg: string, ...args: unknown[]): void => {
      log('info', msg, ...args);
    },
    error: (msg: string, ...args: unknown[]): void => {
      log('error', msg, ...args);
    },
    warn: (msg: string, ...args: unknown[]): void => {
      log('warn', msg, ...args);
    },
  };
};

export const logger = createLogger(config.logLevel);
