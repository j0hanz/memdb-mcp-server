import path from 'node:path';
import process from 'node:process';

type LogLevel = 'error' | 'info' | 'warn';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.memdb', 'memory.db');
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

const resolveDbPath = (env: NodeJS.ProcessEnv): string => {
  if (env.MEMDB_PATH === ':memory:') return ':memory:';
  return path.resolve(DEFAULT_DB_PATH);
};

export const config = {
  dbPath: resolveDbPath(process.env),
  logLevel: DEFAULT_LOG_LEVEL,
};
