import { config, type LogLevel } from './config.js';

export interface Logger {
  info: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
}

const levels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const shouldLog = (level: LogLevel, logLevel: LogLevel): boolean =>
  levels[level] <= levels[logLevel];

export const createLogger = (logLevel: LogLevel): Logger => ({
  info: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('info', logLevel)) return;
    console.error(`[INFO] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('error', logLevel)) return;
    console.error(`[ERROR] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('warn', logLevel)) return;
    console.error(`[WARN] ${msg}`, ...args);
  },
});

export const logger = createLogger(config.logLevel);
