import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_SHUTDOWN_TIMEOUT = 5000;
const MIN_SHUTDOWN_TIMEOUT = 1000;
const MAX_SHUTDOWN_TIMEOUT = 60000;

export type LogLevel = 'error' | 'info' | 'warn';

const normalizePath = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const validateDbPath = (value: string): void => {
  if (value.includes('\0')) {
    throw new Error('Invalid MEMDB_PATH: null byte detected');
  }
};

const resolveNormalizedDbPath = (
  cliDbPath: string | undefined,
  cliMemory: boolean | undefined,
  envPath: string | undefined
): string => {
  if (cliMemory === true) return ':memory:';
  return normalizePath(cliDbPath) ?? normalizePath(envPath) ?? DEFAULT_DB_PATH;
};

export const resolveDbPath = (
  cliDbPath: string | undefined,
  cliMemory: boolean | undefined,
  envPath: string | undefined
): string => {
  const normalized = resolveNormalizedDbPath(cliDbPath, cliMemory, envPath);
  if (normalized === ':memory:') return normalized;
  validateDbPath(normalized);
  return path.resolve(normalized);
};

const isLogLevel = (value: string): value is LogLevel =>
  value === 'info' || value === 'warn' || value === 'error';

export const resolveLogLevel = (
  cliValue: string | undefined,
  envValue: string | undefined
): LogLevel => {
  const candidate = normalizePath(cliValue) ?? normalizePath(envValue);
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

export const resolveShutdownTimeout = (
  cliValue: string | undefined,
  envValue: string | undefined
): number => {
  const raw = normalizePath(cliValue) ?? normalizePath(envValue);
  if (!raw) return DEFAULT_SHUTDOWN_TIMEOUT;
  const parsed = Number(raw);
  validateShutdownTimeout(parsed, raw);
  return parsed;
};

const cli = parseArgs({
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
});

export const config = {
  dbPath: resolveDbPath(
    cli.values.db,
    cli.values.memory,
    process.env.MEMDB_PATH
  ),
  logLevel: resolveLogLevel(
    cli.values['log-level'],
    process.env.MEMDB_LOG_LEVEL
  ),
  shutdownTimeout: resolveShutdownTimeout(
    cli.values['shutdown-timeout'],
    process.env.MEMDB_SHUTDOWN_TIMEOUT
  ),
};
