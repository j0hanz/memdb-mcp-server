import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

type LogLevel = 'error' | 'info' | 'warn';

interface CliValues {
  db?: string;
  memory?: boolean;
  'log-level'?: string;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), '.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const normalizeValue = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
};

const parseCli = (): CliValues =>
  parseArgs({
    args: process.argv.slice(2),
    options: {
      db: { type: 'string' },
      memory: { type: 'boolean' },
      'log-level': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
    allowNegative: true,
  }).values;

const resolveDbPath = (cli: CliValues, env: NodeJS.ProcessEnv): string => {
  if (cli.memory === true) return ':memory:';
  const raw =
    normalizeValue(cli.db) ?? normalizeValue(env.MEMDB_PATH) ?? DEFAULT_DB_PATH;
  if (raw === ':memory:') return raw;
  if (raw.includes('\0')) {
    throw new Error('Invalid MEMDB_PATH: null byte detected');
  }
  return path.resolve(raw);
};

const isLogLevel = (value: string): value is LogLevel =>
  value === 'info' || value === 'warn' || value === 'error';

const resolveLogLevel = (cli: CliValues, env: NodeJS.ProcessEnv): LogLevel => {
  const raw =
    normalizeValue(cli['log-level']) ?? normalizeValue(env.MEMDB_LOG_LEVEL);
  if (!raw) return DEFAULT_LOG_LEVEL;
  if (!isLogLevel(raw)) {
    throw new Error(
      `Invalid log level: ${raw}. Use one of: info, warn, error.`
    );
  }
  return raw;
};

const cli = parseCli();

export const config = {
  dbPath: resolveDbPath(cli, process.env),
  logLevel: resolveLogLevel(cli, process.env),
};
