import assert from 'node:assert/strict';
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

const ensureDbDirectory = async (dbPath: string): Promise<void> => {
  if (dbPath === ':memory:') return;

  const dbDir = path.dirname(dbPath);
  if (dbDir === '.') return;

  const timeoutMs = 5000;
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Database directory creation timed out'));
    }, timeoutMs);
  });

  try {
    await Promise.race([mkdir(dbDir, { recursive: true }), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

export const executeAll = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow[] => stmt.all(...params) as DbRow[];

export const executeGet = (
  stmt: StatementSync,
  ...params: SqlParam[]
): DbRow | undefined => stmt.get(...params) as DbRow | undefined;

export const executeRun = (
  stmt: StatementSync,
  ...params: SqlParam[]
): { changes: number | bigint } => {
  const res = stmt.run(...params);
  return { changes: res.changes };
};

export const sqlAll = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): DbRow[] => getSqlTagStore().all(strings, ...params) as DbRow[];

export const sqlGet = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): DbRow | undefined =>
  getSqlTagStore().get(strings, ...params) as DbRow | undefined;

export const sqlRun = (
  strings: TemplateStringsArray,
  ...params: SqlParam[]
): { changes: number | bigint } => {
  const res = getSqlTagStore().run(strings, ...params);
  return { changes: res.changes };
};

export const withImmediateTransaction = <T>(operation: () => T): T => {
  const db = getDb();

  assert.ok(!db.isTransaction, 'Cannot start nested transaction');

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
  assert.ok(
    SAVEPOINT_NAME_PATTERN.test(name),
    `Invalid savepoint name: ${name}`
  );

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

export const mapRowToMemory = (row: DbRow, tags: string[] = []): Memory => {
  const {
    id: idRaw,
    content,
    summary: summaryRaw,
    importance: impRaw = 0,
    memory_type: typeRaw = 'general',
    created_at: created,
    accessed_at: accessed,
    hash,
  } = row;

  const id = typeof idRaw === 'bigint' ? Number(idRaw) : (idRaw as number);
  if (!Number.isSafeInteger(id)) throw new Error('Invalid id');

  if (typeof content !== 'string') throw new Error('Invalid content');

  let summary: string | undefined;
  if (summaryRaw === null || summaryRaw === undefined) {
    summary = undefined;
  } else if (typeof summaryRaw === 'string') {
    summary = summaryRaw;
  } else {
    throw new Error('Invalid summary');
  }

  const importance =
    typeof impRaw === 'bigint' ? Number(impRaw) : (impRaw as number);
  if (!Number.isSafeInteger(importance)) throw new Error('Invalid importance');

  if (
    typeof typeRaw !== 'string' ||
    !MEMORY_TYPES.includes(typeRaw as MemoryType)
  ) {
    throw new Error('Invalid memory_type');
  }

  if (typeof created !== 'string') throw new Error('Invalid created_at');

  if (typeof accessed !== 'string') throw new Error('Invalid accessed_at');

  if (typeof hash !== 'string') throw new Error('Invalid hash');

  return {
    id,
    content,
    summary,
    tags,
    importance,
    memory_type: typeRaw as MemoryType,
    created_at: created,
    accessed_at: accessed,
    hash,
  };
};

export const mapRowToSearchResult = (
  row: DbRow,
  tags: string[] = []
): SearchResult => {
  const memory = mapRowToMemory(row, tags);
  const relRaw = row.relevance;

  let relevance = 0;
  if (relRaw !== null && relRaw !== undefined) {
    if (typeof relRaw === 'bigint') {
      relevance = Number(relRaw);
    } else {
      relevance = relRaw as number;
    }
  }

  if (!Number.isFinite(relevance)) throw new Error('Invalid relevance');

  return {
    ...memory,
    relevance,
  };
};

export const mapRowToRelationship = (row: DbRow): Relationship => {
  const {
    id: idRaw,
    from_hash: fromHash,
    to_hash: toHash,
    relation_type: relationType,
    created_at: created,
  } = row;

  const id = typeof idRaw === 'bigint' ? Number(idRaw) : (idRaw as number);
  if (!Number.isSafeInteger(id)) throw new Error('Invalid id');

  if (typeof fromHash !== 'string') throw new Error('Invalid from_hash');

  if (typeof toHash !== 'string') throw new Error('Invalid to_hash');

  if (typeof relationType !== 'string')
    throw new Error('Invalid relation_type');

  if (typeof created !== 'string') throw new Error('Invalid created_at');

  return {
    id,
    from_hash: fromHash,
    to_hash: toHash,
    relation_type: relationType,
    created_at: created,
  };
};

export const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = sqlGet`SELECT id FROM memories WHERE hash = ${hash}`;
  if (!row) return undefined;
  const idRaw = row.id;
  const id = typeof idRaw === 'bigint' ? Number(idRaw) : (idRaw as number);
  if (!Number.isSafeInteger(id)) throw new Error('Invalid id');
  return id;
};

export const requireMemoryIdByHash = (
  hash: string,
  message = `Memory not found: ${hash}`
): number => {
  const id = findMemoryIdByHash(hash);
  if (id === undefined) throw new Error(message);
  return id;
};

export const loadTagsForMemoryIds = (
  memoryIds: readonly number[]
): Map<number, string[]> => {
  const uniqueIds: number[] = [];
  const seen = new Set<number>();
  for (const id of memoryIds) {
    if (!seen.has(id)) {
      seen.add(id);
      uniqueIds.push(id);
    }
  }

  if (uniqueIds.length === 0) return new Map();

  const rows = sqlAll`
    SELECT memory_id, tag
    FROM tags
    WHERE memory_id IN (SELECT value FROM json_each(${JSON.stringify(uniqueIds)}))
    ORDER BY memory_id, tag
  `;

  const tagsById = new Map<number, string[]>();
  for (const row of rows) {
    const memoryIdRaw = row.memory_id;
    const memoryId =
      typeof memoryIdRaw === 'bigint'
        ? Number(memoryIdRaw)
        : (memoryIdRaw as number);

    const tag = row.tag as string;

    const list = tagsById.get(memoryId);
    if (list) {
      list.push(tag);
    } else {
      tagsById.set(memoryId, [tag]);
    }
  }

  return tagsById;
};
