import path from 'node:path';
import process from 'node:process';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'memory.db');

const normalizeEnvPath = (value?: string): string | undefined => {
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

const resolveDbPath = (value?: string): string => {
  const normalized = normalizeEnvPath(value);
  if (!normalized) return DEFAULT_DB_PATH;
  if (normalized === ':memory:') return normalized;
  validateDbPath(normalized);
  return path.resolve(normalized);
};

export const config = {
  dbPath: resolveDbPath(process.env.MEMDB_PATH),
};
