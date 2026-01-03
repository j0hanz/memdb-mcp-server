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

const removeTagsFromSet = (
  tags: Set<string>,
  removeTags: readonly string[]
): void => {
  for (const tag of removeTags) {
    tags.delete(tag);
  }
};

const enforceTagLimit = (
  existingTags: Set<string>,
  addTags: readonly string[],
  maxTags: number
): void => {
  let projectedCount = existingTags.size;
  for (const tag of addTags) {
    if (existingTags.has(tag)) continue;
    projectedCount += 1;
    if (projectedCount > maxTags) {
      throw new Error('Too many tags (max ' + String(maxTags) + ')');
    }
    existingTags.add(tag);
  }
};

const assertTagCapacity = (
  memoryId: number,
  addTags: readonly string[],
  removeTags: readonly string[]
): void => {
  if (addTags.length === 0) return;
  const existingTags = loadTagsForMemory(memoryId);
  if (removeTags.length > 0) {
    removeTagsFromSet(existingTags, removeTags);
  }
  enforceTagLimit(existingTags, addTags, 100);
};

interface UpdateMemoryOptions {
  importance?: number;
  memoryType?: string;
  tags?: readonly string[];
  addTags?: readonly string[];
  removeTags?: readonly string[];
}

const updateMetadataFields = (
  memoryId: number,
  options: UpdateMemoryOptions
): void => {
  if (options.importance === undefined && options.memoryType === undefined) {
    return;
  }
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
  params.push(memoryId);
  executeRun(
    db.prepare(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`),
    ...params
  );
};

const replaceTags = (memoryId: number, tags: readonly string[]): void => {
  executeRun(db.prepare('DELETE FROM tags WHERE memory_id = ?'), memoryId);
  insertTags(memoryId, normalizeTags(tags, 100));
};

const addTagsToMemory = (
  memoryId: number,
  tags: readonly string[],
  removeTags: readonly string[] = []
): void => {
  if (tags.length === 0) return;
  const normalizedTags = normalizeTags(tags, 100);
  const removeSet = new Set(removeTags);
  const tagsToInsert =
    removeSet.size === 0
      ? normalizedTags
      : normalizedTags.filter((tag) => !removeSet.has(tag));
  if (tagsToInsert.length === 0) return;
  assertTagCapacity(memoryId, tagsToInsert, removeTags);
  insertTags(memoryId, tagsToInsert);
};

const removeTagsFromMemory = (
  memoryId: number,
  tags: readonly string[]
): void => {
  if (tags.length === 0) return;
  const deleteTag = db.prepare(
    'DELETE FROM tags WHERE memory_id = ? AND tag = ?'
  );
  for (const tag of tags) executeRun(deleteTag, memoryId, tag);
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
