import { config, type LogLevel } from './config.js';

const levels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const shouldLog = (level: LogLevel): boolean =>
  levels[level] <= levels[config.logLevel];

export const logger = {
  info: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('info')) return;
    console.error(`[INFO] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('error')) return;
    console.error(`[ERROR] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]): void => {
    if (!shouldLog('warn')) return;
    console.error(`[WARN] ${msg}`, ...args);
  },
};
