import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

import { config } from '../config.js';
import {
  type Memory,
  MEMORY_TYPES,
  type MemoryType,
  type Relationship,
  type SearchResult,
} from '../types.js';

export type DbRow = Record<string, unknown>;
export type SqlParam = string | number | bigint | null | Uint8Array;

const SCHEMA_SQL = `
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

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const ensureDbDirectory = async (dbPath: string): Promise<void> => {
  if (dbPath === ':memory:') return;

  const dbDir = path.dirname(dbPath);
  if (dbDir === '.') return;

  await withTimeout(
    mkdir(dbDir, { recursive: true }),
    5000,
    'Database directory creation timed out'
  );
};

const enableDefensiveMode = (database: DatabaseSync): void => {
  const extended = database as unknown as {
    enableDefensive?: (active: boolean) => void;
  };
  if (typeof extended.enableDefensive === 'function') {
    extended.enableDefensive(true);
  }
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

let dbInstance: DatabaseSync | undefined;

export const initDb = async (): Promise<void> => {
  if (dbInstance) return;

  try {
    await ensureDbDirectory(config.dbPath);
    dbInstance = createDatabase(config.dbPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Failed to initialize database: ${message}`);
    throw err;
  }
};

export const getDb = (): DatabaseSync => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
};

const MAX_CACHED_STATEMENTS = 200;

type SqlTagStore = ReturnType<DatabaseSync['createTagStore']>;

let sqlTagStore: SqlTagStore | undefined;

const getSqlTagStore = (): SqlTagStore => {
  const db = getDb();
  sqlTagStore ??= db.createTagStore(MAX_CACHED_STATEMENTS);
  return sqlTagStore;
};

const resetSqlTagStore = (): void => {
  if (!sqlTagStore) return;
  const store = sqlTagStore as unknown as {
    reset?: () => void;
    clear?: () => void;
  };
  if (typeof store.reset === 'function') {
    store.reset();
    return;
  }
  if (typeof store.clear === 'function') {
    store.clear();
  }
};

class LruStatementCache {
  private readonly cache = new Map<string, StatementSync>();

  constructor(private readonly maxSize: number) {}

  get(sql: string): StatementSync | undefined {
    const hit = this.cache.get(sql);
    if (!hit) return undefined;

    // Refresh LRU order
    this.cache.delete(sql);
    this.cache.set(sql, hit);

    return hit;
  }

  set(sql: string, stmt: StatementSync): void {
    this.cache.set(sql, stmt);

    if (this.cache.size <= this.maxSize) return;

    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) this.cache.delete(oldestKey);
  }

  clear(): void {
    this.cache.clear();
  }
}

const statementCache = new LruStatementCache(MAX_CACHED_STATEMENTS);

export const closeDb = (): void => {
  if (!dbInstance?.isOpen) return;

  dbInstance.close();
  dbInstance = undefined;
  resetSqlTagStore();
  sqlTagStore = undefined;
  statementCache.clear();
};

export const prepareCached = (sql: string): StatementSync => {
  const cached = statementCache.get(sql);
  if (cached) return cached;

  const stmt = getDb().prepare(sql);
  statementCache.set(sql, stmt);

  return stmt;
};

const isDbRow = (value: unknown): value is DbRow =>
  typeof value === 'object' && value !== null;

const assertDbRow = (value: unknown): DbRow => {
  if (!isDbRow(value)) throw new Error('Invalid row');
  return value;
};

const toDbRowArray = (value: unknown): DbRow[] => {
  if (!Array.isArray(value)) throw new Error('Expected rows array');
  return value.map(assertDbRow);
};

const toDbRowOrUndefined = (value: unknown): DbRow | undefined => {
  if (value === undefined) return undefined;
  return assertDbRow(value);
};

const toRunResult = (value: unknown): { changes: number | bigint } => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid run result');
  }

  const result = value as { changes?: unknown };
  const { changes } = result;

  if (typeof changes !== 'number' && typeof changes !== 'bigint') {
    throw new Error('Invalid run result');
  }

  return { changes };
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

export const sqlAll = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): DbRow[] => toDbRowArray(getSqlTagStore().all(strings, ...params));

export const sqlGet = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): DbRow | undefined =>
  toDbRowOrUndefined(getSqlTagStore().get(strings, ...params));

export const sqlRun = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): { changes: number | bigint } =>
  toRunResult(getSqlTagStore().run(strings, ...params));

export const withImmediateTransaction = <T>(operation: () => T): T => {
  const db = getDb();

  if (db.isTransaction) {
    throw new Error('Cannot start nested transaction');
  }

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

const SAVEPOINT_NAME_PATTERN = /^[A-Za-z_]\w*$/;

export const withSavepoint = <T>(name: string, operation: () => T): T => {
  if (!SAVEPOINT_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }

  const db = getDb();
  db.exec(`SAVEPOINT ${name}`);

  try {
    const result = operation();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw err;
  }
};

const createFieldError = (field: string): Error =>
  new Error(`Invalid ${field}`);

const assertFiniteNumber = (value: number, field: string): number => {
  if (!Number.isFinite(value)) {
    throw createFieldError(field);
  }
  return value;
};

const toNumber = (value: unknown, field: string): number => {
  if (typeof value === 'number') {
    return assertFiniteNumber(value, field);
  }
  if (typeof value === 'bigint') {
    return assertFiniteNumber(Number(value), field);
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

const isMemoryType = (value: string): value is MemoryType =>
  MEMORY_TYPES.includes(value as MemoryType);

const toMemoryType = (value: unknown, field: string): MemoryType => {
  const str = toString(value, field);
  if (!isMemoryType(str)) throw createFieldError(field);
  return str;
};

export const mapRowToMemory = (row: DbRow, tags: string[] = []): Memory => ({
  id: toSafeInteger(row.id, 'id'),
  content: toString(row.content, 'content'),
  summary: toOptionalString(row.summary, 'summary'),
  tags,
  importance: toSafeInteger(row.importance ?? 0, 'importance'),
  memory_type: toMemoryType(row.memory_type ?? 'general', 'memory_type'),
  created_at: toString(row.created_at, 'created_at'),
  accessed_at: toString(row.accessed_at, 'accessed_at'),
  hash: toString(row.hash, 'hash'),
});

export const mapRowToSearchResult = (
  row: DbRow,
  tags: string[] = []
): SearchResult => ({
  ...mapRowToMemory(row, tags),
  relevance: toOptionalNumber(row.relevance, 'relevance') ?? 0,
});

export const mapRowToRelationship = (row: DbRow): Relationship => ({
  id: toSafeInteger(row.id, 'id'),
  from_hash: toString(row.from_hash, 'from_hash'),
  to_hash: toString(row.to_hash, 'to_hash'),
  relation_type: toString(row.relation_type, 'relation_type'),
  created_at: toString(row.created_at, 'created_at'),
});

export const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = sqlGet`SELECT id FROM memories WHERE hash = ${hash}`;
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

export const requireMemoryIdByHash = (
  hash: string,
  message = `Memory not found: ${hash}`
): number => {
  const id = findMemoryIdByHash(hash);
  if (id === undefined) throw new Error(message);
  return id;
};

const dedupeIds = (ids: readonly number[]): number[] => {
  const seen = new Set<number>();
  const unique: number[] = [];

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  return unique;
};

const pushToMapArray = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  map.set(key, [value]);
};

export const loadTagsForMemoryIds = (
  memoryIds: readonly number[]
): Map<number, string[]> => {
  const uniqueIds = dedupeIds(memoryIds);
  if (uniqueIds.length === 0) return new Map();

  const rows = sqlAll`
    SELECT memory_id, tag
    FROM tags
    WHERE memory_id IN (SELECT value FROM json_each(${JSON.stringify(uniqueIds)}))
    ORDER BY memory_id, tag
  `;

  const tagsById = new Map<number, string[]>();
  for (const row of rows) {
    const memoryId = toSafeInteger(row.memory_id, 'memory_id');
    const tag = toString(row.tag, 'tag');
    pushToMapArray(tagsById, memoryId, tag);
  }

  return tagsById;
};
