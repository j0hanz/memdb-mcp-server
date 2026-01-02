import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'memory.db');
const DEFAULT_LOG_LEVEL = 'info';

export type LogLevel = 'error' | 'info' | 'warn';

const normalizePath = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
};

const validateDbPath = (value: string): void => {
  if (value.includes('\0')) {
    throw new Error('Invalid MEMDB_PATH: null byte detected');
  }
};

const resolveDbPath = (
  cliDbPath: string | undefined,
  cliMemory: boolean | undefined,
  envPath: string | undefined
): string => {
  if (cliMemory === true) return ':memory:';
  const normalized =
    normalizePath(cliDbPath) ?? normalizePath(envPath) ?? DEFAULT_DB_PATH;
  if (normalized === ':memory:') return normalized;
  validateDbPath(normalized);
  return path.resolve(normalized);
};

const isLogLevel = (value: string): value is LogLevel =>
  value === 'info' || value === 'warn' || value === 'error';

const resolveLogLevel = (
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

const cli = parseArgs({
  args: process.argv.slice(2),
  options: {
    db: { type: 'string' },
    memory: { type: 'boolean' },
    'log-level': { type: 'string' },
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
};
