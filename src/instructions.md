# memdb Instructions

> **Guidance for the Agent:** These instructions are available as a resource (`internal://instructions`). Load them when you are confused about tool usage.

## 1. Core Capability

- **Domain:** Local, SQLite-backed memory store for text notes with tags and relationships.
- **Primary Resources:** `Memory`, `Relationship`, `Stats`.

## 2. The "Golden Path" Workflows (Critical)

_Describe the standard order of operations. Do not assume the agent knows this._

### Workflow A: Find relevant context

1. Call `search_memories` with a focused query.
2. Call `recall` with `depth: 1`–`2` if you need connected graph context.
3. Call `get_memory` using the `hash` from results.
   > **Constraint:** Never guess hashes. Always search or recall first.

### Workflow B: Store or revise knowledge

1. Call `store_memory` (single) or `store_memories` (batch).
2. Use `update_memory` to revise; the response returns a new `hash`.
3. Call `create_relationship` to link memories when needed.
4. Call `delete_memory` / `delete_memories` / `delete_relationship` only with explicit user intent.

## 3. Tool Nuances & "Gotchas"

- **`search_memories`**: Query is 1–1000 chars and max 50 terms; whitespace-only is invalid.
- **`recall`**: `depth` is 0–3; depth 0 returns no relationships.
- **`update_memory`**: Content changes produce a new `hash`; store the new hash for follow-up.
- **`delete_*` tools**: Destructive—confirm user intent before calling.
- **Tags**: 1–100 tags, no whitespace, max 50 chars; prefer `kebab-case`.
- **Hashes**: 32 hex chars; case-insensitive but normalized to lowercase.

## 4. Error Handling Strategy

- If you receive `E_NOT_FOUND`, re-run `search_memories` or `get_relationships` to confirm the `hash`.
- If `E_INVALID_ARG`, check tag formatting, term limits, or batch size (max 50).
- If `E_TOOL_ERROR` (e.g., FTS issues), call `memory_stats` and retry later.
- If `E_TIMEOUT`, reduce batch size or split the request.
