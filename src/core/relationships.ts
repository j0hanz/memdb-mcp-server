import type {
  CreateRelationshipResult,
  Relationship,
  StatementResult,
} from '../types.js';
import {
  mapRowToRelationship,
  requireMemoryIdByHash,
  sqlAll,
  sqlGet,
  sqlRun,
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

    const inserted = sqlGet`
      INSERT OR IGNORE INTO relationships
        (from_memory_id, to_memory_id, relation_type)
      VALUES (${fromId}, ${toId}, ${input.relation_type})
      RETURNING id
    `;

    if (inserted) {
      return { id: toSafeInteger(inserted.id, 'id'), isNew: true };
    }

    const existing = sqlGet`
      SELECT id FROM relationships
      WHERE from_memory_id = ${fromId}
        AND to_memory_id = ${toId}
        AND relation_type = ${input.relation_type}
    `;

    if (!existing) {
      throw new Error('Failed to resolve relationship id');
    }

    return { id: toSafeInteger(existing.id, 'id'), isNew: false };
  });

export const getRelationships = (input: {
  hash: string;
  direction?: 'outgoing' | 'incoming' | 'both';
}): Relationship[] => {
  const direction = input.direction ?? 'both';

  const rows = (() => {
    switch (direction) {
      case 'outgoing':
        return sqlAll`
          SELECT r.id, r.relation_type, r.created_at,
                 mf.hash as from_hash, mt.hash as to_hash
          FROM relationships r
          JOIN memories mf ON r.from_memory_id = mf.id
          JOIN memories mt ON r.to_memory_id = mt.id
          WHERE mf.hash = ${input.hash}
          ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id
        `;
      case 'incoming':
        return sqlAll`
          SELECT r.id, r.relation_type, r.created_at,
                 mf.hash as from_hash, mt.hash as to_hash
          FROM relationships r
          JOIN memories mf ON r.from_memory_id = mf.id
          JOIN memories mt ON r.to_memory_id = mt.id
          WHERE mt.hash = ${input.hash}
          ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id
        `;
      case 'both':
        return sqlAll`
          SELECT r.id, r.relation_type, r.created_at,
                 mf.hash as from_hash, mt.hash as to_hash
          FROM relationships r
          JOIN memories mf ON r.from_memory_id = mf.id
          JOIN memories mt ON r.to_memory_id = mt.id
          WHERE mf.hash = ${input.hash} OR mt.hash = ${input.hash}
          ORDER BY r.relation_type, mf.hash, mt.hash, r.created_at, r.id
        `;
    }
  })();

  return rows.map(mapRowToRelationship);
};

export const deleteRelationship = (input: {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}): StatementResult => {
  const result = sqlRun`
    DELETE FROM relationships
    WHERE from_memory_id = (SELECT id FROM memories WHERE hash = ${input.from_hash})
      AND to_memory_id = (SELECT id FROM memories WHERE hash = ${input.to_hash})
      AND relation_type = ${input.relation_type}
  `;

  return { changes: toSafeInteger(result.changes, 'changes') };
};
