# memdb MCP Server — AI Usage Instructions

Use this server to store and retrieve persistent memories (facts, decisions, lessons, plans) in a local SQLite database. Prefer using these tools over "remembering" state in chat.

## Operating Rules

- Use tools only when the operation changes or verifies memory state.
- Prefer `search_memories` or `memory_stats` to establish state before updating/deleting.
- Operate by stable identifiers (`hash`, 32-char hex MD5) rather than ambiguous user text.
- Batch operations when available: use `store_memories` / `delete_memories` for multiple items.
- Treat destructive tools (`delete_memory`, `delete_memories`, `delete_relationship`) as destructive: require explicit user confirmation unless the user clearly requested deletion.
- Keep operations atomic; if a request is vague, ask a clarifying question before calling tools.

### Quick Decision Rules

- If unsure what exists → call `search_memories` or `memory_stats` before mutation.
- If the user provides multiple items → use `store_memories` (up to 50) or `delete_memories`.
- If the user asks to delete without a specific target → list matches first and ask which hash.
- Prefer `update_memory` over delete+recreate when correcting an existing memory.

### Client UX Notes (VS Code)

- Non-read-only tools typically require user confirmation.
- Tool lists can be cached; users can reset via **MCP: Reset Cached Tools**.
- Only run MCP servers from trusted sources.

## Data Model (What the Server Operates On)

### Memory

| Field         | Type       | Description                                                                 |
| ------------- | ---------- | --------------------------------------------------------------------------- |
| `id`          | int        | Auto-generated row ID                                                       |
| `hash`        | string     | MD5 of content (32 hex chars); primary lookup key                           |
| `content`     | string     | 1–100,000 chars; the stored text                                            |
| `tags`        | string[]   | 1–100 tags; no whitespace; max 50 chars each; use `kebab-case`              |
| `importance`  | int (0–10) | Priority (0=low, 10=critical); higher surfaces first in search              |
| `memory_type` | enum       | `general` `fact` `plan` `decision` `reflection` `lesson` `error` `gradient` |
| `created_at`  | ISO 8601   | Creation timestamp                                                          |
| `accessed_at` | ISO 8601   | Last access timestamp                                                       |

### Relationship (Knowledge Graph Edge)

| Field           | Type   | Description                                                       |
| --------------- | ------ | ----------------------------------------------------------------- |
| `from_hash`     | string | Source memory hash                                                |
| `to_hash`       | string | Target memory hash                                                |
| `relation_type` | string | No whitespace; e.g., `depends_on`, `causes`, `part_of`, `follows` |

### Constraints

- Changing content changes the hash (content-addressed).
- Tags and `relation_type` must not contain whitespace.
- Search query: 1–1,000 chars, max 50 terms.
- Batch limits: 50 items for `store_memories` and `delete_memories`.

## Response Shape

All tools return JSON in `structuredContent`:

```json
// Success
{ "ok": true, "result": { ... } }

// Error
{ "ok": false, "error": { "code": "E_CODE", "message": "..." } }
```

Error responses also set `isError: true` on the top-level tool result.

## Workflows (Recommended)

### 1) Capture a new memory

1. Prepare content (crisp, 1–3 sentences).
2. Choose 2–6 tags: domain tags (`auth`, `postgres`) + intent tags (`decision`, `bug`).
3. Call `store_memory`. Record the returned `hash` if you need to reference it later.

### 2) Retrieve context for a task

1. Call `search_memories` with a focused query (include relevant tag text in the query).
2. If you need related context, call `recall` with `depth: 1` or `2`.
3. For verbatim content of a specific hash, call `get_memory`.

### 3) Maintain quality over time

1. Prefer `update_memory` over creating duplicates when correcting content.
2. Use `create_relationship` to link durable facts/decisions in the knowledge graph.
3. Use `delete_memory` / `delete_memories` only with explicit user intent.

## Tools (What to Use, When)

### store_memory

Store a single memory with tags.

- **Use when:** You have one clear item to persist.
- **Args:** `content` (req), `tags` (req, 1–100), `importance` (opt, 0–10), `memory_type` (opt).
- **Returns:** `{ id, hash, isNew }`.
- **Notes:** Idempotent (same content → same hash, `isNew: false`).

### store_memories

Batch store up to 50 memories.

- **Use when:** Importing multiple items at once.
- **Args:** `items[]` (each has `content`, `tags`, optional `importance`, `memory_type`).
- **Returns:** `{ results, succeeded, failed }`.
- **Notes:** Partial success supported.

### search_memories

Full-text + tag search.

- **Use when:** Discovering what exists; start here before mutating.
- **Args:** `query` (1–1,000 chars, max 50 terms).
- **Returns:** Array of `Memory` + `relevance`, up to 100 results.
- **Notes:** Read-only. Content matches rank higher than tag matches.

### get_memory

Fetch a single memory by hash.

- **Use when:** You need verbatim content after search identified a hash.
- **Args:** `hash` (32 hex chars).
- **Returns:** `Memory`.
- **Notes:** Read-only. Returns `E_NOT_FOUND` if missing.

### update_memory

Update content (and optionally replace tags).

- **Use when:** Correcting or refining an existing memory.
- **Args:** `hash` (req), `content` (req), `tags` (opt, replaces all if provided).
- **Returns:** `{ updated: true, oldHash, newHash }`.
- **Notes:** Hash changes because content changes. Idempotent.

### delete_memory

Delete a single memory by hash.

- **Use when:** User explicitly wants removal.
- **Args:** `hash`.
- **Returns:** `{ deleted: true }` or `E_NOT_FOUND`.
- **Notes:** Destructive. Confirm before calling.

### delete_memories

Batch delete up to 50 hashes.

- **Use when:** Bulk cleanup with explicit user intent.
- **Args:** `hashes[]`.
- **Returns:** `{ results, succeeded, failed }`.
- **Notes:** Destructive. Partial success supported.

### create_relationship

Link two memories with a typed edge.

- **Use when:** Building a knowledge graph (e.g., `depends_on`, `causes`, `part_of`).
- **Args:** `from_hash`, `to_hash`, `relation_type`.
- **Returns:** `{ id, isNew }`.
- **Notes:** Idempotent.

### get_relationships

List relationships for a memory.

- **Use when:** Inspecting local graph around one memory.
- **Args:** `hash`, `direction` (opt: `outgoing`, `incoming`, `both`; default `both`).
- **Returns:** Array of `Relationship`.
- **Notes:** Read-only.

### delete_relationship

Remove a relationship edge.

- **Use when:** An edge is wrong or outdated.
- **Args:** `from_hash`, `to_hash`, `relation_type`.
- **Returns:** `{ deleted: true }` or `E_NOT_FOUND`.
- **Notes:** Destructive. Confirm before calling.

### recall

Search + traverse relationships to return a connected cluster.

- **Use when:** You need broader context beyond keyword matches.
- **Args:** `query`, `depth` (opt, 0–3; default 1).
- **Returns:** `{ memories, relationships, depth }`.
- **Notes:** Read-only. Use `depth: 1–2` by default.

### memory_stats

Database statistics and health.

- **Use when:** Sanity-checking the DB or reporting status.
- **Args:** (none).
- **Returns:** `{ memoryCount, tagCount, oldestMemory, newestMemory }`.
- **Notes:** Read-only.

## Safety

- **Do not store secrets** (API keys, passwords, tokens, private keys) in memory content.
- **Confirm destructive operations** (`delete_memory`, `delete_memories`, `delete_relationship`) before calling.
