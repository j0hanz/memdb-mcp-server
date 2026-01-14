# memdb MCP Server — AI Usage Instructions

Use this server to store and retrieve persistent memories (facts, decisions, lessons, plans) in a local SQLite database. Prefer these tools over "remembering" state in chat.

## Operating Rules

- Use tools only when the operation changes or verifies memory state.
- Prefer `search_memories` or `memory_stats` to establish state before updating/deleting.
- Operate by stable identifiers (`hash`, 32-char hex MD5) rather than ambiguous user text.
- Treat destructive tools (`delete_memory`, `delete_memories`, `delete_relationship`) as destructive: require explicit user confirmation unless clearly requested.
- Keep operations atomic; if a request is vague, ask a clarifying question.
- **Client UX:** Tool lists can be cached (reset via "MCP: Reset Cached Tools"). Only run MCP servers from trusted sources.

### Strategies

- **Discovery:** Start with `search_memories` or `memory_stats` to discover what exists. Use `recall` (depth 1-2) when you need connected context.
- **Action:** Use `store_memories` for batch imports (up to 50). Prefer `update_memory` to fix content (preserves history/context better than delete+create). Always confirm explicit deletions with the user.

## Data Model

- **Memory:**
  - `hash` (MD5 of content, primary key)
  - `content` (1–100k chars)
  - `tags` (1–100 items, no whitespace, `kebab-case`)
  - `importance` (0–10, 10=critical)
  - `memory_type` (`general`, `fact`, `plan`, `decision`, `reflection`, `lesson`, `error`, `gradient`)
  - `accessed_at` is updated when you call `get_memory`
- **Relationship:** Directed edge (`from_hash` → `to_hash`) with a typed label (`relation_type`).

## Workflows

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

## Tools

### store_memory

Store a single memory with tags.

- **Use when:** You have one clear item to persist.
- **Args:** `content` (req), `tags` (req), `importance` (opt), `memory_type` (opt).
- **Returns:** `{ id, hash, isNew }`.

### store_memories

Batch store up to 50 memories.

- **Use when:** Importing multiple items at once.
- **Args:** `items[]` (each has `content`, `tags`, optional `importance`, `memory_type`).
- **Returns:** `{ results, succeeded, failed }`.

### search_memories

Full-text + tag search.

- **Use when:** Discovering what exists; start here before mutating.
- **Args:** `query` (1–1,000 chars).
- **Returns:** Array of `Memory` + `relevance`, up to 100 results.
- **Returns:** Array of `Memory` + `relevance`, up to 100 results (includes `tags`).
- **Notes:** Content matches rank higher than tag matches.

### get_memory

Fetch a single memory by hash.

- **Use when:** You need verbatim content after search identified a hash.
- **Args:** `hash` (32 hex chars).
- **Returns:** `Memory` object (includes `tags`).
- **Notes:** Updates `accessed_at` on read.

### update_memory

Update content (and optionally replace tags).

- **Use when:** Correcting or refining an existing memory.
- **Args:** `hash` (req), `content` (req), `tags` (opt, replaces all).
- **Returns:** `{ updated: true, oldHash, newHash }`.
- **Notes:** Hash changes because content changes (content-addressed).

### delete_memory

Delete a single memory by hash.

- **Use when:** User explicitly wants removal.
- **Args:** `hash`.
- **Returns:** `{ deleted: true }` or error if not found.

### delete_memories

Batch delete up to 50 hashes.

- **Use when:** Bulk cleanup with explicit user intent.
- **Args:** `hashes[]`.
- **Returns:** `{ results, succeeded, failed }`.

### create_relationship

Link two memories with a typed edge.

- **Use when:** Building a knowledge graph (e.g., `depends_on`, `causes`, `part_of`).
- **Args:** `from_hash`, `to_hash`, `relation_type`.
- **Returns:** `{ id, isNew }`.

### get_relationships

List relationships for a memory.

- **Use when:** Inspecting local graph around one memory.
- **Args:** `hash`, `direction` (opt: `outgoing`, `incoming`, `both`; default `both`).
- **Returns:** Array of `Relationship` objects.

### delete_relationship

Remove a relationship edge.

- **Use when:** An edge is wrong or outdated.
- **Args:** `from_hash`, `to_hash`, `relation_type`.
- **Returns:** `{ deleted: true }`.

### recall

Search + traverse relationships to return a connected cluster.

- **Use when:** You need broader context beyond keyword matches.
- **Args:** `query`, `depth` (opt, 0–3; default 1).
- **Returns:** `{ memories, relationships, depth }` where `memories` include `tags`.

### memory_stats

Database statistics and health.

- **Use when:** Sanity-checking the DB or reporting status.
- **Args:** (none).
- **Returns:** `{ memoryCount, tagCount, oldestMemory, newestMemory }`.

## Response Shape

Success: `{ "ok": true, "result": { ... } }`
Error: `{ "ok": false, "error": { "code": "E_...", "message": "..." } }`

### Common Errors

| Code            | Meaning                       | Resolution                          |
| --------------- | ----------------------------- | ----------------------------------- |
| `E_NOT_FOUND`   | Memory/Relationship not found | Check hash or create new            |
| `E_INVALID_ARG` | Validation failed (zod)       | Check limits, types, and formatting |
| `E_TOOL_ERROR`  | Internal/Db error             | Check server logs or stats          |

## Limits

- **Content Size:** 100,000 chars per memory
- **Tag Count:** 100 per memory
- **Tag Length:** 50 chars (no whitespace)
- **Batch Size:** 50 items (store/delete)
- **Query Length:** 1,000 chars

## Security

- **No Secrets:** Do not store API keys, passwords, or PII in memory content.
- **Confirmation:** Always ask before using `delete_*` tools unless the user explicitly requested it.
