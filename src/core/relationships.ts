import type {
  CreateRelationshipResult,
  Relationship,
  StatementResult,
} from '../types.js';
import {
  executeAll,
  executeGet,
  executeRun,
  mapRowToRelationship,
  prepareCached,
  requireMemoryIdByHash,
  toSafeInteger,
  withImmediateTransaction,
} from './db.js';

const buildNotFoundMessage = (hash: string): string =>
  `Memory not found: ${hash}`;

export const createRelationship = (input: {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}): CreateRelationshipResult =>
  withImmediateTransaction(() => {
    const fromId = requireMemoryIdByHash(
      input.from_hash,
      buildNotFoundMessage(input.from_hash)
    );
    const toId = requireMemoryIdByHash(
      input.to_hash,
      buildNotFoundMessage(input.to_hash)
    );

    if (fromId === toId) {
      throw new Error('Cannot create self-referential relationship');
    }

    const stmtInsertRelationship = prepareCached(`
  INSERT OR IGNORE INTO relationships (from_memory_id, to_memory_id, relation_type)
  VALUES (?, ?, ?)
  RETURNING id
`);

    const inserted = executeGet(
      stmtInsertRelationship,
      fromId,
      toId,
      input.relation_type
    );

    if (inserted) {
      return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
    }

    const stmtFindRelationshipId = prepareCached(`
  SELECT id FROM relationships
  WHERE from_memory_id = ? AND to_memory_id = ? AND relation_type = ?
`);
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

  const orderBy =
    ' ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id';

  switch (direction) {
    case 'outgoing':
      return `${baseSelect} WHERE mf.hash = ?${orderBy}`;
    case 'incoming':
      return `${baseSelect} WHERE mt.hash = ?${orderBy}`;
    case 'both':
      return `${baseSelect} WHERE mf.hash = ? OR mt.hash = ?${orderBy}`;
  }
};

export const getRelationships = (input: {
  hash: string;
  direction?: 'outgoing' | 'incoming' | 'both';
}): Relationship[] => {
  const direction = input.direction ?? 'both';
  const stmt = prepareCached(buildGetRelationshipsQuery(direction));

  const params = direction === 'both' ? [input.hash, input.hash] : [input.hash];
  const rows = executeAll(stmt, ...params);

  return rows.map(mapRowToRelationship);
};

export const deleteRelationship = (input: {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}): StatementResult => {
  const stmtDeleteRelationship = prepareCached(`
  DELETE FROM relationships
  WHERE from_memory_id = (SELECT id FROM memories WHERE hash = ?)
    AND to_memory_id = (SELECT id FROM memories WHERE hash = ?)
    AND relation_type = ?
`);

  const result = executeRun(
    stmtDeleteRelationship,
    input.from_hash,
    input.to_hash,
    input.relation_type
  );

  return { changes: toSafeInteger(result.changes, 'changes') };
};
