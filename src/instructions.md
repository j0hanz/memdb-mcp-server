# memdb MCP Server Instructions

This server provides **local, SQLite-backed long-term memory**. Use it to store, retrieve, and organize short text memories (notes, facts, decisions, lessons) with tags and optional relationships.

## Scope & Constraints

- This server only manages memories in a local SQLite DB (default: `<cwd>/.memdb/memory.db`). It does not read/write project files.
- All tool results return JSON in `structuredContent` with `{ ok: true, result }` or `{ ok: false, error }`.
- Memory identity is an MD5 `hash` (32 hex chars). Changing content changes the hash.
- Tags and relation types must not contain whitespace (use `kebab-case`).

## Tool Guide

### Store

- `store_memory`: Create or deduplicate a single memory.
  - Use when you have one clear item.
  - Provide `tags` (1–100). Optional: `importance` (0–10), `memory_type`.
- `store_memories`: Batch store up to 50 memories.
  - Use for importing many items; supports partial success.

### Find & Read

- `search_memories`: Search across content + tags.
  - Use first for discovery.
  - Prefer specific queries and tags (include tag text in the query).
- `get_memory`: Fetch a memory by `hash`.
  - Use after search results identify a specific `hash`.

### Update

- `update_memory`: Replace content (and optionally replace tags) for a given `hash`.
  - Use to correct or refine a memory.
  - Expect a new `hash` in the result.

### Delete (Destructive)

- `delete_memory`: Delete a single memory by `hash`.
- `delete_memories`: Batch delete up to 50 hashes.

Use delete tools only when the user explicitly wants removal.

### Relationships (Knowledge Graph)

- `create_relationship`: Create a typed edge `from_hash` → `to_hash`.
  - Use to connect related memories (e.g., `depends_on`, `causes`, `part_of`).
- `get_relationships`: List relationships for a memory.
  - Use to inspect the local graph around one memory.
- `delete_relationship`: Remove a relationship.
  - Use when an edge is wrong/outdated.

### Deep Recall

- `recall`: Search + traverse relationships to return a connected cluster.
  - Use when you need broader context beyond keyword matches.
  - `depth` controls hops (0–3). Use 1–2 by default.

### Health / Overview

- `memory_stats`: Returns database stats (counts, oldest/newest).
  - Use to sanity-check the DB or report status.

## Recommended Workflows

### Capture a new memory (single)

1. Choose crisp content (1–3 sentences).
2. Choose stable tags (topic + type), e.g. `auth`, `decision`, `bug`, `postgres`.
3. Call `store_memory`.

### Retrieve context for a task

1. Use `search_memories` with a focused query.
2. If you need related context, use `recall` (depth 1–2).
3. Use `get_memory` for any specific hash you need verbatim.

### Maintain quality over time

1. Prefer `update_memory` over creating duplicates when you are correcting an existing item.
2. Use `create_relationship` to connect durable facts/decisions.
3. Use delete tools only with explicit user intent.

## Tagging & Memory Type Guidelines

- Prefer 2–6 tags per memory: 1–2 domain tags + 1–2 intent tags.
- `memory_type` is optional; use it when it helps retrieval: `fact`, `decision`, `plan`, `lesson`, `error`, `reflection`, `gradient`, `general`.
- Use `importance` to surface critical items (0=low, 10=critical).

## Safety

- Do not store secrets (API keys, passwords, tokens, private keys) in memory content.
- Confirm destructive operations (`delete_*`, `delete_relationship`) before calling them.
