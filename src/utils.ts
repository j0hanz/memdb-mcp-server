import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_SHUTDOWN_TIMEOUT = 5000;
const MIN_SHUTDOWN_TIMEOUT = 1000;
const MAX_SHUTDOWN_TIMEOUT = 60000;

export type LogLevel = 'error' | 'info' | 'warn';

const normalizeValue = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const validateDbPath = (value: string): void => {
  if (value.includes('\0')) {
    throw new Error('Invalid MEMDB_PATH: null byte detected');
  }
};

const resolveDbPathCandidate = (input: {
  cliDbPath?: string;
  cliMemory?: boolean;
  envPath?: string;
}): string => {
  if (input.cliMemory === true) return ':memory:';
  return (
    normalizeValue(input.cliDbPath) ??
    normalizeValue(input.envPath) ??
    DEFAULT_DB_PATH
  );
};

const ensureDbPath = (value: string): string => {
  if (value === ':memory:') return value;
  validateDbPath(value);
  return path.resolve(value);
};

const resolveDbPath = (input: {
  cliDbPath?: string;
  cliMemory?: boolean;
  envPath?: string;
}): string => {
  return ensureDbPath(resolveDbPathCandidate(input));
};

const isLogLevel = (value: string): value is LogLevel =>
  value === 'info' || value === 'warn' || value === 'error';

const resolveLogLevel = (input: {
  cliValue?: string;
  envValue?: string;
}): LogLevel => {
  const candidate =
    normalizeValue(input.cliValue) ?? normalizeValue(input.envValue);
  if (!candidate) return DEFAULT_LOG_LEVEL;
  if (!isLogLevel(candidate)) {
    throw new Error(
      `Invalid log level: ${candidate}. Use one of: info, warn, error.`
    );
  }
  return candidate;
};

const validateShutdownTimeout = (parsed: number, raw: string): void => {
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(
      `Invalid shutdown timeout: ${raw}. Must be an integer in milliseconds.`
    );
  }
  if (parsed < MIN_SHUTDOWN_TIMEOUT || parsed > MAX_SHUTDOWN_TIMEOUT) {
    throw new Error(
      `Shutdown timeout must be between ${String(MIN_SHUTDOWN_TIMEOUT)} and ${String(MAX_SHUTDOWN_TIMEOUT)} ms.`
    );
  }
};

const resolveShutdownTimeout = (input: {
  cliValue?: string;
  envValue?: string;
}): number => {
  const raw = normalizeValue(input.cliValue) ?? normalizeValue(input.envValue);
  if (!raw) return DEFAULT_SHUTDOWN_TIMEOUT;
  const parsed = Number(raw);
  validateShutdownTimeout(parsed, raw);
  return parsed;
};

const parseCliValues = (): {
  db?: string;
  memory?: boolean;
  'log-level'?: string;
  'shutdown-timeout'?: string;
} => {
  return parseArgs({
    args: process.argv.slice(2),
    options: {
      db: { type: 'string' },
      memory: { type: 'boolean' },
      'log-level': { type: 'string' },
      'shutdown-timeout': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
    allowNegative: true,
  }).values;
};

const cli = parseCliValues();

export const config = {
  dbPath: resolveDbPath({
    ...(cli.db !== undefined ? { cliDbPath: cli.db } : {}),
    ...(cli.memory !== undefined ? { cliMemory: cli.memory } : {}),
    ...(process.env.MEMDB_PATH !== undefined
      ? { envPath: process.env.MEMDB_PATH }
      : {}),
  }),
  logLevel: resolveLogLevel({
    ...(cli['log-level'] !== undefined ? { cliValue: cli['log-level'] } : {}),
    ...(process.env.MEMDB_LOG_LEVEL !== undefined
      ? { envValue: process.env.MEMDB_LOG_LEVEL }
      : {}),
  }),
  shutdownTimeout: resolveShutdownTimeout({
    ...(cli['shutdown-timeout'] !== undefined
      ? { cliValue: cli['shutdown-timeout'] }
      : {}),
    ...(process.env.MEMDB_SHUTDOWN_TIMEOUT !== undefined
      ? { envValue: process.env.MEMDB_SHUTDOWN_TIMEOUT }
      : {}),
  }),
};

const levels: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const shouldLog = (level: LogLevel, threshold: number): boolean =>
  levels[level] <= threshold;

const buildLogger = (
  threshold: number
): {
  info: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
} => {
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
