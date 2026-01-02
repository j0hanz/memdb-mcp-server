import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';

// Test with in-memory database to avoid affecting real data
describe('MemoryService', () => {
  let db: DatabaseSync;

  before(() => {
    // Create in-memory database for testing
    db = new DatabaseSync(':memory:', { timeout: 5000 });

    // Initialize schema (mirror of database.ts)
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');

    db.exec(`
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

    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        memory_id INTEGER NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (memory_id, tag),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      ) STRICT;
    `);

    db.exec(`
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

    // FTS5 for search
    db.exec(`
      CREATE VIRTUAL TABLE memories_fts USING fts5(
        content,
        summary,
        content_rowid='id'
      );
    `);

    db.exec(`
      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, summary)
        VALUES (new.id, new.content, new.summary);
      END;
    `);
  });

  after(() => {
    db.close();
  });

  describe('createMemory', () => {
    it('should create a memory with valid hash', () => {
      const content = 'Test memory content';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      const insert = db.prepare(
        'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      );
      const result = insert.run(content, 5, 'fact', hash);

      assert.ok(result.lastInsertRowid > 0, 'Should return valid ID');
      assert.strictEqual(hash.length, 32, 'MD5 hash should be 32 characters');
    });

    it('should generate consistent hash for same content', () => {
      const content = 'Reproducible content';
      const hash1 = crypto.createHash('md5').update(content).digest('hex');
      const hash2 = crypto.createHash('md5').update(content).digest('hex');

      assert.strictEqual(hash1, hash2, 'Same content should produce same hash');
    });

    it('should prevent duplicate content via unique hash constraint', () => {
      const content = 'Unique content for duplicate test';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      const insert = db.prepare(
        'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      );
      insert.run(content, 0, 'general', hash);

      // Attempting to insert duplicate should throw
      assert.throws(
        () => insert.run(content, 0, 'general', hash),
        /UNIQUE constraint failed/,
        'Duplicate hash should throw constraint error'
      );
    });
  });

  describe('getMemory', () => {
    it('should retrieve memory by hash', () => {
      const content = 'Retrievable content';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      db.prepare(
        'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      ).run(content, 3, 'note', hash);

      const memory = db
        .prepare('SELECT * FROM memories WHERE hash = ?')
        .get(hash) as { content: string; hash: string } | undefined;

      assert.ok(memory, 'Memory should be found');
      assert.strictEqual(memory.content, content);
      assert.strictEqual(memory.hash, hash);
    });

    it('should return undefined for non-existent hash', () => {
      const memory = db
        .prepare('SELECT * FROM memories WHERE hash = ?')
        .get('nonexistent_hash_value') as unknown;

      assert.strictEqual(
        memory,
        undefined,
        'Should return undefined for missing memory'
      );
    });
  });

  describe('searchMemories (FTS5)', () => {
    it('should find memories matching search query', () => {
      const content = 'TypeScript programming language guide';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      db.prepare(
        'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      ).run(content, 5, 'guide', hash);

      const results = db
        .prepare(
          `
          SELECT m.*, bm25(memories_fts) as relevance
          FROM memories m
          JOIN memories_fts fts ON m.id = fts.rowid
          WHERE memories_fts MATCH ?
          ORDER BY relevance
          LIMIT 10
        `
        )
        .all('TypeScript') as Array<{ content: string }>;

      assert.ok(results.length > 0, 'Should find at least one result');
      assert.ok(
        results[0]?.content.includes('TypeScript'),
        'Result should contain search term'
      );
    });
  });

  describe('deleteMemory', () => {
    it('should delete memory by hash', () => {
      const content = 'Content to delete';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      db.prepare(
        'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
      ).run(content, 0, 'temp', hash);

      const result = db
        .prepare('DELETE FROM memories WHERE hash = ?')
        .run(hash);

      assert.strictEqual(result.changes, 1, 'Should delete exactly one row');

      const deleted = db
        .prepare('SELECT * FROM memories WHERE hash = ?')
        .get(hash);
      assert.strictEqual(deleted, undefined, 'Memory should be deleted');
    });
  });

  describe('tags', () => {
    it('should associate tags with memories', () => {
      const content = 'Tagged content';
      const hash = crypto.createHash('md5').update(content).digest('hex');

      const insertResult = db
        .prepare(
          'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
        )
        .run(content, 0, 'general', hash);
      const memoryId = insertResult.lastInsertRowid as number;

      const insertTag = db.prepare(
        'INSERT INTO tags (memory_id, tag) VALUES (?, ?)'
      );
      insertTag.run(memoryId, 'important');
      insertTag.run(memoryId, 'work');

      const tags = db
        .prepare('SELECT tag FROM tags WHERE memory_id = ?')
        .all(memoryId) as Array<{ tag: string }>;

      assert.strictEqual(tags.length, 2, 'Should have 2 tags');
      assert.ok(
        tags.some((t) => t.tag === 'important'),
        'Should have "important" tag'
      );
      assert.ok(
        tags.some((t) => t.tag === 'work'),
        'Should have "work" tag'
      );
    });
  });

  describe('relationships', () => {
    it('should link two memories', () => {
      const content1 = 'Source memory for relationship';
      const content2 = 'Target memory for relationship';
      const hash1 = crypto.createHash('md5').update(content1).digest('hex');
      const hash2 = crypto.createHash('md5').update(content2).digest('hex');

      const result1 = db
        .prepare(
          'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
        )
        .run(content1, 0, 'general', hash1);
      const result2 = db
        .prepare(
          'INSERT INTO memories (content, importance, memory_type, hash) VALUES (?, ?, ?, ?)'
        )
        .run(content2, 0, 'general', hash2);

      const fromId = result1.lastInsertRowid as number;
      const toId = result2.lastInsertRowid as number;

      db.prepare(
        'INSERT INTO relationships (from_memory_id, to_memory_id, relation_type) VALUES (?, ?, ?)'
      ).run(fromId, toId, 'related_to');

      const relationship = db
        .prepare(
          'SELECT * FROM relationships WHERE from_memory_id = ? AND to_memory_id = ?'
        )
        .get(fromId, toId) as { relation_type: string } | undefined;

      assert.ok(relationship, 'Relationship should exist');
      assert.strictEqual(relationship.relation_type, 'related_to');
    });
  });

  describe('stats', () => {
    it('should return memory and relationship counts', () => {
      const memoryCount = (
        db.prepare('SELECT COUNT(*) as count FROM memories').get() as {
          count: number;
        }
      ).count;
      const relationshipCount = (
        db.prepare('SELECT COUNT(*) as count FROM relationships').get() as {
          count: number;
        }
      ).count;

      assert.ok(
        typeof memoryCount === 'number',
        'Memory count should be a number'
      );
      assert.ok(
        typeof relationshipCount === 'number',
        'Relationship count should be a number'
      );
      assert.ok(memoryCount >= 0, 'Memory count should be non-negative');
      assert.ok(
        relationshipCount >= 0,
        'Relationship count should be non-negative'
      );
    });
  });
});
