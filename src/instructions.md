# memdb Instructions

> **Guidance for the Agent:** These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when you are unsure about tool usage.

## 1. Core Capability

- **Domain:** Local, SQLite-backed memory store for text notes with tags and relationships.
- **Primary Resources:** `Memory`, `Relationship`, `Stats`.

## 2. The "Golden Path" Workflows (Critical)

_Describe the standard order of operations using ONLY tools that exist._

### Workflow A: Find relevant context

1. Call `search_memories` with a focused query.
2. Call `recall` for connected graph exploration (depth 1–2).
3. Call `get_memory` using the `hash` (SHA-256) from results.
   > **Constraint:** Never guess hashes. Always search or recall first.

### Workflow B: Store or revise knowledge

1. Call `store_memory` (single) or `store_memories` (batch).
2. Call `update_memory` to revise; returns `{ newHash }` (content changes change hash).
3. Call `create_relationship` to link memories.
4. Call `delete_memory` / `delete_memories` / `delete_relationship` only with explicit user permission.

## 3. Tool Nuances & Gotchas

_Focus on behavior and pitfalls._

- **`search_memories`** / **`recall`**
  - **Inputs:** Query 1–1000 chars; `recall` depth 0–3 (default 1).
  - **Returns:** List of memories (scored).

- **`store_memory`** / **`update_memory`**
  - **Inputs:** `content` (max 100k chars), `tags` (1–100, no whitespace, max 50 chars).
  - **Side effects:** Writes to SQLiteFTS; `update` creates new hash if content changes.

- **`create_relationship`**
  - **Inputs:** `from_hash`, `to_hash`, `relation_type` (no whitespace).
  - **Constraint:** Relationships are directed edges.

- **`delete_*`**
  - **Side effects:** Destructive; returns `changes: 0` if not found.

## 4. Error Handling Strategy

- **`E_NOT_FOUND`**: Re-run search/recall to get valid hash.
- **`E_INVALID_ARG`**: Check tags (no spaces), limits (batch max 50), or hash format.
- **`E_TIMEOUT`**: Reduce batch size or complexity.
