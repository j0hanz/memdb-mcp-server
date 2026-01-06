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

const shouldLog = (level: LogLevel, threshold: number): boolean =>
  levels[level] <= threshold;

const buildLogger = (threshold: number): Logger => {
  const write =
    (level: LogLevel) =>
    (msg: string, ...args: unknown[]): void => {
      if (!shouldLog(level, threshold)) return;
      console.error(`[${level.toUpperCase()}] ${msg}`, ...args);
    };

  return {
    info: write('info'),
    error: write('error'),
    warn: write('warn'),
  };
};

export const logger = buildLogger(levels[config.logLevel]);
