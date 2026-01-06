export const SCHEMA_SQL = `
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

export const FTS_SYNC_SQL = `
  INSERT INTO memories_fts(rowid, content, summary)
  SELECT id, content, summary FROM memories
  WHERE id NOT IN (SELECT rowid FROM memories_fts);
`;
