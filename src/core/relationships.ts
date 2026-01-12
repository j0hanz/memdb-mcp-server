import type {
  CreateRelationshipResult,
  Relationship,
  StatementResult,
} from '../types.js';
import {
  db,
  type DbRow,
  executeAll,
  executeGet,
  executeRun,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

const stmtFindMemoryIdByHash = db.prepare(
  'SELECT id FROM memories WHERE hash = ?'
);

const findMemoryIdByHash = (hash: string): number | undefined => {
  const row = executeGet(stmtFindMemoryIdByHash, hash);
  if (!row) return undefined;
  return toSafeInteger(row.id, 'id');
};

const requireMemoryId = (hash: string): number => {
  const id = findMemoryIdByHash(hash);
  if (id === undefined) {
    throw new Error(`Memory not found: ${hash}`);
  }
  return id;
};

const toString = (value: unknown, field: string): string => {
  if (typeof value === 'string') return value;
  throw new Error(`Invalid ${field}`);
};

const mapRowToRelationship = (row: DbRow): Relationship => ({
  id: toSafeInteger(row.id, 'id'),
  from_hash: toString(row.from_hash, 'from_hash'),
  to_hash: toString(row.to_hash, 'to_hash'),
  relation_type: toString(row.relation_type, 'relation_type'),
  created_at: toString(row.created_at, 'created_at'),
});

const stmtInsertRelationship = db.prepare(`
  INSERT OR IGNORE INTO relationships (from_memory_id, to_memory_id, relation_type)
  VALUES (?, ?, ?)
  RETURNING id
`);

const stmtFindRelationshipId = db.prepare(`
  SELECT id FROM relationships
  WHERE from_memory_id = ? AND to_memory_id = ? AND relation_type = ?
`);

export interface CreateRelationshipInput {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}

export const createRelationship = (
  input: CreateRelationshipInput
): CreateRelationshipResult =>
  withImmediateTransaction(() => {
    const fromId = requireMemoryId(input.from_hash);
    const toId = requireMemoryId(input.to_hash);

    if (fromId === toId) {
      throw new Error('Cannot create self-referential relationship');
    }

    const inserted = executeGet(
      stmtInsertRelationship,
      fromId,
      toId,
      input.relation_type
    );

    if (inserted) {
      return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
    }

    // Relationship already exists, find its ID
    const existing = executeGet(
      stmtFindRelationshipId,
      fromId,
      toId,
      input.relation_type
    );
    if (!existing) {
      throw new Error('Failed to resolve relationship id');
    }
    return { id: toSafeInteger(existing.id, 'id'), isNew: false };
  });

// Query that joins with memories to get hashes instead of IDs
const buildGetRelationshipsQuery = (
  direction: 'outgoing' | 'incoming' | 'both'
): string => {
  const baseSelect = `
    SELECT r.id, r.relation_type, r.created_at,
           mf.hash as from_hash, mt.hash as to_hash
    FROM relationships r
    JOIN memories mf ON r.from_memory_id = mf.id
    JOIN memories mt ON r.to_memory_id = mt.id
  `;

  switch (direction) {
    case 'outgoing':
      return `${baseSelect} WHERE mf.hash = ?`;
    case 'incoming':
      return `${baseSelect} WHERE mt.hash = ?`;
    case 'both':
      return `${baseSelect} WHERE mf.hash = ? OR mt.hash = ?`;
  }
};

const stmtGetRelationships = {
  outgoing: db.prepare(buildGetRelationshipsQuery('outgoing')),
  incoming: db.prepare(buildGetRelationshipsQuery('incoming')),
  both: db.prepare(buildGetRelationshipsQuery('both')),
} as const;

export interface GetRelationshipsInput {
  hash: string;
  direction?: 'outgoing' | 'incoming' | 'both';
}

export const getRelationships = (
  input: GetRelationshipsInput
): Relationship[] => {
  const direction = input.direction ?? 'both';
  const stmt = stmtGetRelationships[direction];

  const params = direction === 'both' ? [input.hash, input.hash] : [input.hash];
  const rows = executeAll(stmt, ...params);

  return rows.map(mapRowToRelationship);
};

export interface DeleteRelationshipInput {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}

const stmtDeleteRelationship = db.prepare(`
  DELETE FROM relationships
  WHERE from_memory_id = (SELECT id FROM memories WHERE hash = ?)
    AND to_memory_id = (SELECT id FROM memories WHERE hash = ?)
    AND relation_type = ?
`);

export const deleteRelationship = (
  input: DeleteRelationshipInput
): StatementResult => {
  const result = executeRun(
    stmtDeleteRelationship,
    input.from_hash,
    input.to_hash,
    input.relation_type
  );
  return { changes: toSafeInteger(result.changes, 'changes') };
};
