import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import { config } from '../config.js';
import type { Memory, SearchResult } from '../types.js';

export type DbRow = Record<string, unknown>;

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    summary TEXT,
    importance INTEGER DEFAULT 0,
    memory_type TEXT DEFAULT 'general',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    accessed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    hash TEXT UNIQUE NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS tags (
    memory_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (memory_id, tag),
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_tags_tag_memory_id ON tags(tag, memory_id);

  CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_memory_id INTEGER NOT NULL,
    to_memory_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (to_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
    UNIQUE(from_memory_id, to_memory_id, relation_type)
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_relationships_to_memory_id ON relationships(to_memory_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    summary,
    content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content, summary)
    VALUES (new.id, new.content, new.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    DELETE FROM memories_fts WHERE rowid = old.id;
    INSERT INTO memories_fts(rowid, content, summary)
    VALUES (new.id, new.content, new.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    DELETE FROM memories_fts WHERE rowid = old.id;
  END;
`;

const FTS_SYNC_SQL = `
  INSERT INTO memories_fts(rowid, content, summary)
  SELECT id, content, summary FROM memories
  WHERE id NOT IN (SELECT rowid FROM memories_fts);
`;

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
  const database = new DatabaseSync(dbPath, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
    allowExtension: false,
  });
  enableDefensiveMode(database);
  initializeSchema(database);
  return database;
};

try {
  await ensureDbDirectory(config.dbPath);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ERROR] Failed to create database directory: ${message}`);
  throw err;
}

export const db = createDatabase(config.dbPath);

export const closeDb = (): void => {
  if (!db.isOpen) return;
  db.close();
};

export type SqlParam = string | number | bigint | null | Uint8Array;

const MAX_CACHED_STATEMENTS = 200;
const statementCache = new Map<string, StatementSync>();
const statementCacheOrder: string[] = [];

const enforceStatementCacheLimit = (): void => {
  if (statementCacheOrder.length <= MAX_CACHED_STATEMENTS) return;
  const oldestSql = statementCacheOrder.shift();
  if (!oldestSql) return;

  statementCache.delete(oldestSql);
};

const isDbRow = (value: unknown): value is DbRow => {
  return typeof value === 'object' && value !== null;
};

const toDbRowArray = (value: unknown): DbRow[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected rows array');
  }
  const rows: DbRow[] = [];
  for (const row of value) {
    if (!isDbRow(row)) {
      throw new Error('Invalid row');
    }
    rows.push(row);
  }
  return rows;
};

const toDbRowOrUndefined = (value: unknown): DbRow | undefined => {
  if (value === undefined) return undefined;
  if (!isDbRow(value)) {
    throw new Error('Invalid row');
  }
  return value;
};

const toRunResult = (value: unknown): { changes: number | bigint } => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid run result');
  }
  const changes: unknown = Reflect.get(value, 'changes');
  if (typeof changes !== 'number' && typeof changes !== 'bigint') {
    throw new Error('Invalid run result');
  }
  return { changes };
};

export const prepareCached = (sql: string): StatementSync => {
  const cached = statementCache.get(sql);
  if (cached) return cached;

  const stmt = db.prepare(sql);
  statementCache.set(sql, stmt);
  statementCacheOrder.push(sql);

  enforceStatementCacheLimit();

  return stmt;
};

export const executeAll = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow[] => toDbRowArray(stmt.all(...params));

export const executeGet = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow | undefined => toDbRowOrUndefined(stmt.get(...params));

export const executeRun = (
  stmt: StatementSync,
  ...params: SqlParam[]
): { changes: number | bigint } => toRunResult(stmt.run(...params));

export const withImmediateTransaction = <T>(operation: () => T): T => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const createFieldError = (field: string): Error =>
  new Error(`Invalid ${field}`);

const toNumber = (value: unknown, field: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  throw createFieldError(field);
};

export const toSafeInteger = (value: unknown, field: string): number => {
  const numeric = toNumber(value, field);
  if (!Number.isSafeInteger(numeric)) {
    throw createFieldError(field);
  }
  return numeric;
};

const toString = (value: unknown, field: string): string => {
  if (typeof value === 'string') return value;
  throw createFieldError(field);
};

const toOptionalString = (
  value: unknown,
  field: string
): string | undefined => {
  if (value === null || value === undefined) return undefined;
  return toString(value, field);
};

const toOptionalNumber = (
  value: unknown,
  field: string
): number | undefined => {
  if (value === null || value === undefined) return undefined;
  return toNumber(value, field);
};

export const mapRowToMemory = (row: DbRow): Memory => ({
  id: toSafeInteger(row.id, 'id'),
  content: toString(row.content, 'content'),
  summary: toOptionalString(row.summary, 'summary'),
  created_at: toString(row.created_at, 'created_at'),
  accessed_at: toString(row.accessed_at, 'accessed_at'),
  hash: toString(row.hash, 'hash'),
});

export const mapRowToSearchResult = (row: DbRow): SearchResult => ({
  ...mapRowToMemory(row),
  relevance: toOptionalNumber(row.relevance, 'relevance') ?? 0,
});
