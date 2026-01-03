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

const buildLogger = (threshold: number): Logger => {
  const write =
    (level: LogLevel) =>
    (msg: string, ...args: unknown[]): void => {
      if (levels[level] > threshold) return;
      console.error(`[${level.toUpperCase()}] ${msg}`, ...args);
    };

  return {
    info: write('info'),
    error: write('error'),
    warn: write('warn'),
  };
};

export const createLogger = (logLevel: LogLevel): Logger =>
  buildLogger(levels[logLevel]);

export const logger = createLogger(config.logLevel);
