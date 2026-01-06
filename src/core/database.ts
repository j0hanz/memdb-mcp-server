import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from '../utils/config.js';
import { FTS_SYNC_SQL, SCHEMA_SQL } from './database-schema.js';

const ensureDbDirectory = async (dbPath: string): Promise<void> => {
  if (dbPath === ':memory:') return;
  await mkdir(path.dirname(dbPath), { recursive: true });
};

const isEnableDefensive = (
  value: unknown
): value is (active: boolean) => void => {
  return typeof value === 'function';
};

const enableDefensiveMode = (database: DatabaseSync): void => {
  const enableDefensive: unknown = Reflect.get(database, 'enableDefensive');
  if (!isEnableDefensive(enableDefensive)) return;
  enableDefensive(true);
};

const initializeSchema = (database: DatabaseSync): void => {
  database.exec(SCHEMA_SQL);
  database.exec(FTS_SYNC_SQL);
};

const createDatabase = (dbPath: string): DatabaseSync => {
  const database = new DatabaseSync(dbPath, { timeout: 5000 });
  enableDefensiveMode(database);
  initializeSchema(database);
  return database;
};

await ensureDbDirectory(config.dbPath);

export const db = createDatabase(config.dbPath);

export const closeDb = (): void => {
  if (!db.isOpen) return;
  db.close();
};
