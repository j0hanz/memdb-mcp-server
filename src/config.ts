import path from 'node:path';
import process from 'node:process';

type LogLevel = 'error' | 'info' | 'warn';

const DEFAULT_DB_PATH = path.resolve('.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_TOOL_TIMEOUT_MS = 15000;

const hasNullByte = (value: string): boolean => value.includes('\0');

const parseLogLevel = (value: string | undefined): LogLevel | undefined => {
  if (value === undefined) return undefined;
  if (hasNullByte(value)) {
    throw new Error('Invalid MEMDB_LOG_LEVEL: null byte detected');
  }
  switch (value) {
    case 'error':
    case 'info':
    case 'warn':
      return value;
    default:
      throw new Error(
        `Invalid MEMDB_LOG_LEVEL: ${value} (expected: error|warn|info)`
      );
  }
};

const parseTimeoutMs = (
  value: string | undefined,
  name: string
): number | undefined => {
  if (value === undefined) return undefined;
  if (hasNullByte(value)) {
    throw new Error(`Invalid ${name}: null byte detected`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`Invalid ${name}: expected a non-negative integer`);
  }
  return parsed;
};

const resolveDbPath = (env: NodeJS.ProcessEnv): string => {
  const envPath = env.MEMDB_PATH;
  if (envPath !== undefined) {
    if (hasNullByte(envPath)) {
      throw new Error('Invalid MEMDB_PATH: null byte detected');
    }
    const normalizedEnvPath = envPath.trim();
    if (normalizedEnvPath === ':memory:') return ':memory:';
    if (normalizedEnvPath.length > 0) {
      if (
        process.platform !== 'win32' &&
        path.win32.isAbsolute(normalizedEnvPath)
      ) {
        return path.win32.normalize(normalizedEnvPath);
      }
      return path.resolve(normalizedEnvPath);
    }
  }
  return path.resolve(DEFAULT_DB_PATH);
};

export const config = {
  dbPath: resolveDbPath(process.env),
  logLevel: parseLogLevel(process.env.MEMDB_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL,
  toolTimeoutMs:
    parseTimeoutMs(
      process.env.MEMDB_TOOL_TIMEOUT_MS,
      'MEMDB_TOOL_TIMEOUT_MS'
    ) ?? DEFAULT_TOOL_TIMEOUT_MS,
};
