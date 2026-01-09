import { config } from './config.js';

type LogLevel = (typeof config)['logLevel'];

const LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const threshold = LEVELS[config.logLevel];

const createWriter =
  (level: LogLevel) =>
  (msg: string, ...args: unknown[]): void => {
    if (LEVELS[level] > threshold) return;
    console.error(`[${level.toUpperCase()}] ${msg}`, ...args);
  };

export const logger = {
  info: createWriter('info'),
  warn: createWriter('warn'),
  error: createWriter('error'),
};
