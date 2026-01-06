import type { MemoryUpdateResult } from '../types/index.js';
import { db } from './database.js';
import {
  executeAll,
  executeRun,
  type SqlParam,
  withImmediateTransaction,
} from './db-helpers.js';
import { findMemoryIdByHash, insertTags } from './memory-helpers.js';
import { normalizeTags } from './tag-helpers.js';

const MAX_TAGS = 100;

const loadTagsForMemory = (memoryId: number): Set<string> => {
  const rows = executeAll(
    db.prepare('SELECT tag FROM tags WHERE memory_id = ?'),
    memoryId
  );
  const tags = new Set<string>();
  for (const row of rows) {
    if (typeof row.tag !== 'string') {
      throw new Error('Invalid tag');
    }
    tags.add(row.tag);
  }
  return tags;
};

interface UpdateMemoryOptions {
  importance?: number | undefined;
  memoryType?: string | undefined;
  tags?: readonly string[] | undefined;
  addTags?: readonly string[] | undefined;
  removeTags?: readonly string[] | undefined;
}

const buildMetadataUpdate = (
  options: UpdateMemoryOptions
): { updates: string[]; params: SqlParam[] } => {
  const updates: string[] = [];
  const params: SqlParam[] = [];
  if (options.importance !== undefined) {
    updates.push('importance = ?');
    params.push(options.importance);
  }
  if (options.memoryType !== undefined) {
    updates.push('memory_type = ?');
    params.push(options.memoryType);
  }
  return { updates, params };
};

const updateMetadataFields = (
  memoryId: number,
  options: UpdateMemoryOptions
): void => {
  const { updates, params } = buildMetadataUpdate(options);
  if (updates.length === 0) return;
  params.push(memoryId);
  executeRun(
    db.prepare(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`),
    ...params
  );
};

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  executeRun(db.prepare('DELETE FROM tags WHERE memory_id = ?'), memoryId);
  insertTags(memoryId, normalizeTags(tags, MAX_TAGS));
};

const filterTagsToInsert = (
  tags: readonly string[],
  removeTags: readonly string[]
): string[] => {
  if (removeTags.length === 0) return [...tags];
  const removeSet = new Set(removeTags);
  return tags.filter((tag) => !removeSet.has(tag));
};

const removeTagsFromSet = (
  tags: readonly string[],
  tagSet: Set<string>
): void => {
  for (const tag of tags) {
    tagSet.delete(tag);
  }
};

const enforceTagLimit = (
  existingTags: Set<string>,
  tagsToInsert: readonly string[],
  maxTags: number
): void => {
  let projectedCount = existingTags.size;
  for (const tag of tagsToInsert) {
    if (existingTags.has(tag)) continue;
    projectedCount += 1;
    if (projectedCount > maxTags) {
      throw new Error('Too many tags (max ' + String(maxTags) + ')');
    }
    existingTags.add(tag);
  }
};

const addTagsToMemory = (
  memoryId: number,
  tags: readonly string[],
  removeTags: readonly string[] = []
): void => {
  if (tags.length === 0) return;
  const normalizedTags = normalizeTags(tags, MAX_TAGS);
  const tagsToInsert = filterTagsToInsert(normalizedTags, removeTags);
  if (tagsToInsert.length === 0) return;
  const existingTags = loadTagsForMemory(memoryId);
  removeTagsFromSet(removeTags, existingTags);
  enforceTagLimit(existingTags, tagsToInsert, MAX_TAGS);
  insertTags(memoryId, tagsToInsert);
};

const removeTagsFromMemory = (
  memoryId: number,
  tags: readonly string[]
): void => {
  if (tags.length === 0) return;
  const placeholders = tags.map(() => '?').join(', ');
  const stmt = db.prepare(
    `DELETE FROM tags WHERE memory_id = ? AND tag IN (${placeholders})`
  );
  executeRun(stmt, memoryId, ...tags);
};

const updateTags = (memoryId: number, options: UpdateMemoryOptions): void => {
  if (options.tags !== undefined) {
    replaceTags(memoryId, options.tags);
    return;
  }
  if (options.addTags !== undefined) {
    addTagsToMemory(memoryId, options.addTags, options.removeTags ?? []);
  }
  if (options.removeTags !== undefined) {
    removeTagsFromMemory(memoryId, options.removeTags);
  }
};

export const updateMemory = (
  hash: string,
  options: UpdateMemoryOptions
): MemoryUpdateResult => {
  const memoryId = findMemoryIdByHash(hash);
  if (memoryId === undefined) throw new Error('Memory not found');

  return withImmediateTransaction(() => {
    updateMetadataFields(memoryId, options);
    updateTags(memoryId, options);
    return { updated: true, hash };
  });
};
