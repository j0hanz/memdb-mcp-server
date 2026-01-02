import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from '../utils/config.js';

export class DatabaseManager {
  private db: DatabaseSync;

  constructor() {
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new DatabaseSync(config.dbPath, { timeout: 5000 });
    this.init();
  }

  private init(): void {
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');

    this.db.exec(`
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
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        memory_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (memory_id, tag),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      ) STRICT;
    `);

    this.db.exec(`
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
    `);

    // FTS5
    const ftsRow = this.db
      .prepare(
        "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='memories_fts'"
      )
      .get() as { count: number } | undefined;
    const ftsExists = ftsRow?.count ?? 0;

    if (ftsExists === 0) {
      this.db.exec(`
          CREATE VIRTUAL TABLE memories_fts USING fts5(
            content,
            summary,
            content_rowid='id'
          );
        `);

      this.db.exec(`
          CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
            INSERT INTO memories_fts(rowid, content, summary)
            VALUES (new.id, new.content, new.summary);
          END;
        `);

      this.db.exec(`
          CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
            DELETE FROM memories_fts WHERE rowid = old.id;
            INSERT INTO memories_fts(rowid, content, summary) VALUES (new.id, new.content, new.summary);
          END;
        `);

      this.db.exec(`
          CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
            DELETE FROM memories_fts WHERE rowid = old.id;
          END;
        `);
    }
  }

  public getDb(): DatabaseSync {
    return this.db;
  }
}

export const dbManager = new DatabaseManager();
