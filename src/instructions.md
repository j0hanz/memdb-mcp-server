# memdb INSTRUCTIONS

> Available as resource `internal://instructions`. Load when unsure about tool usage.

## CORE CAPABILITY

- Domain: SQLite-backed memory store with FTS5 search and knowledge graph for AI assistants.
- Primary Resources: Memory (content+tags+hash), Relationship (directed edges).
- Tools: `search_memories` `get_memory` `recall` `get_relationships` `memory_stats` (READ); `store_memory` `store_memories` `update_memory` `delete_memory` `delete_memories` `create_relationship` `delete_relationship` (WRITE).

## THE "GOLDEN PATH" WORKFLOWS (CRITICAL)

### WORKFLOW A: Recall & Exploration

1. `search_memories` with `{ query }` — find memories by content/tags.
2. `recall` with `{ query, depth }` — traverse graph connections from hits.
3. `get_memory` with `{ hash }` — exact retrieval using hash from results.
   NOTE: Never guess hashes. Always search first.

### WORKFLOW B: Knowledge Management

1. `store_memory` or `store_memories` (batch ≤50) to persist content with tags.
2. `create_relationship` to link memories via `{ from_hash, to_hash, relation_type }`.
3. `update_memory` with `{ hash, content }` to revise — returns new hash.
4. `delete_memory` / `delete_memories` — confirm with user first.

## TOOL NUANCES & GOTCHAS

`search_memories` — `query` 1–1000 chars. Broaden if no results.

`recall` — `depth` 0–3 (default 1). Higher depth = more latency. 0 = no traversal.

`store_memory` / `store_memories` — `content` ≤100K, `tags` 1–100 (no whitespace, ≤50 chars), optional `importance` 0–10, optional `memory_type` (general|fact|plan|decision|reflection|lesson|error|gradient). Idempotent. Batch supports partial success.

`update_memory` — `hash` must exist. New `content` required, `tags` optional. Changes the hash.

`get_memory` — `hash`: 64 hex chars (SHA-256). E_NOT_FOUND if missing.

`create_relationship` — `from_hash`, `to_hash`, `relation_type` (e.g. related_to, causes, depends_on). Both hashes must exist. Idempotent.

`get_relationships` — `hash` required, `direction` optional (outgoing|incoming|both).

`delete_memory` / `delete_memories` / `delete_relationship` — Destructive. E_NOT_FOUND if missing.

`memory_stats` — No input. Returns counts and timestamps.

## ERROR HANDLING STRATEGY

- `E_NOT_FOUND`: Hash missing. Search/recall first.
- `E_TIMEOUT`: Reduce batch size or recall depth.
- Validation error: 64-char hex hash, non-empty content, no whitespace in tags.

## RESOURCES

- `internal://instructions`: This document.
