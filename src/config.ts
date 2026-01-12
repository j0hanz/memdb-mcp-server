import path from 'node:path';
import process from 'node:process';

type LogLevel = 'error' | 'info' | 'warn';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

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

const resolveDbPath = (env: NodeJS.ProcessEnv): string => {
  const envPath = env.MEMDB_PATH;
  if (envPath !== undefined) {
    if (hasNullByte(envPath)) {
      throw new Error('Invalid MEMDB_PATH: null byte detected');
    }
    if (envPath === ':memory:') return ':memory:';
    if (envPath.length > 0) return path.resolve(envPath);
  }
  return path.resolve(DEFAULT_DB_PATH);
};

export const config = {
  dbPath: resolveDbPath(process.env),
  logLevel: parseLogLevel(process.env.MEMDB_LOG_LEVEL) ?? DEFAULT_LOG_LEVEL,
};
